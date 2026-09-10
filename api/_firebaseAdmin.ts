import { createSign, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

interface ServiceAccount { project_id: string; client_email: string; private_key: string }
interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  timestampValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}
interface FirestoreDocument { name: string; fields?: Record<string, FirestoreValue>; createTime?: string; updateTime?: string }

let cachedToken: { value: string; expiresAt: number } | null = null;
const FIRESTORE_DATABASE_ID = 'ai-studio-46429e4f-5a9c-4b81-9602-b3382410985b';

function credentials(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error('Firebase service account is incomplete');
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') } as ServiceAccount;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const account = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64url(signer.sign(account.private_key))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error(`Firebase credential exchange failed (${response.status})`);
  const result = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

async function firestore(path: string): Promise<Response> {
  const account = credentials();
  const token = await accessToken();
  return fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/${path}`, { headers: { authorization: `Bearer ${token}` } });
}

async function databaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const account = credentials();
  const token = await accessToken();
  return fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/${path}`,
    { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } }
  );
}

async function firestoreFailure(response: Response, context: string): Promise<Error> {
  let detail = '';
  try {
    const body = await response.json() as { error?: { message?: string; status?: string } };
    const message = body.error?.message?.trim();
    const status = body.error?.status?.trim();
    detail = message ? `: ${status ? `${status} — ` : ''}${message}` : '';
  } catch {
    // Keep the status-only error if Firestore does not return JSON.
  }
  return new Error(`${context} (${response.status})${detail}`);
}

const value = (field?: FirestoreValue): unknown => {
  if (!field) return undefined;
  if ('nullValue' in field) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.timestampValue !== undefined) return field.timestampValue;
  if (field.arrayValue) return (field.arrayValue.values || []).map(value);
  if (field.mapValue) return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([key, child]) => [key, value(child)]));
  return undefined;
};

function firestoreValue(input: unknown): FirestoreValue {
  if (input === null || input === undefined) return { nullValue: null };
  if (typeof input === 'string') return { stringValue: input };
  if (typeof input === 'boolean') return { booleanValue: input };
  if (typeof input === 'number') return Number.isInteger(input) ? { integerValue: String(input) } : { doubleValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(firestoreValue) } };
  if (typeof input === 'object') return {
    mapValue: { fields: Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, child]) => [key, firestoreValue(child)])) }
  };
  throw new Error('Unsupported Firestore value');
}

const documentData = <T>(document: FirestoreDocument): T => Object.fromEntries(
  Object.entries(document.fields || {}).map(([key, field]) => [key, value(field)])
) as T;

const documentFields = (data: Record<string, unknown>) => Object.fromEntries(
  Object.entries(data).filter(([, field]) => field !== undefined).map(([key, field]) => [key, firestoreValue(field)])
);

export interface ServerEmployee { id: string; name: string; role: string; department?: string; employmentType?: 'full-time' | 'part-time'; password?: string; passwordHash?: string }

function employee(document: FirestoreDocument): ServerEmployee {
  const fields = document.fields || {};
  return { id: document.name.split('/').pop() || '', name: String(value(fields.name) || ''), role: String(value(fields.role) || 'employee'), department: value(fields.department) as string | undefined, employmentType: value(fields.employmentType) as 'full-time' | 'part-time' | undefined, password: value(fields.password) as string | undefined, passwordHash: value(fields.passwordHash) as string | undefined };
}

export async function listEmployees(): Promise<ServerEmployee[]> {
  const documents: FirestoreDocument[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await firestore(`employees?${query.toString()}`);
    if (!response.ok) throw await firestoreFailure(response, 'Employee lookup failed');
    const result = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken || undefined;
  } while (pageToken);

  return documents
    .map(employee)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getEmployee(id: string): Promise<ServerEmployee | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const response = await firestore(`employees/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw await firestoreFailure(response, 'Employee lookup failed');
  return employee(await response.json() as FirestoreDocument);
}

function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(employee: ServerEmployee, candidate: string): boolean {
  if (employee.passwordHash) {
    const [scheme, n, r, p, salt, expected] = employee.passwordHash.split('$');
    if (scheme !== 'scrypt' || !n || !r || !p || !salt || !expected) return false;
    const derived = scryptSync(candidate, Buffer.from(salt, 'base64'), Buffer.from(expected, 'base64').length, { N: Number(n), r: Number(r), p: Number(p) });
    return equalSecret(derived.toString('base64'), expected);
  }
  return employee.password ? equalSecret(candidate, employee.password) : false;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export const publicEmployee = (employee: ServerEmployee) => ({ id: employee.id, name: employee.name, role: employee.role, ...(employee.department ? { department: employee.department } : {}), ...(employee.employmentType ? { employmentType: employee.employmentType } : {}) });

export interface ServerDocument<T> {
  id: string;
  data: T;
  createTime?: string;
  updateTime?: string;
}

const validDocumentId = (id: string) => /^[A-Za-z0-9_-]{1,256}$/.test(id);

export async function getServerDocument<T>(collection: string, id: string): Promise<ServerDocument<T> | null> {
  if (!validDocumentId(collection) || !validDocumentId(id)) return null;
  const response = await databaseRequest(`documents/${collection}/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw await firestoreFailure(response, `${collection} lookup failed`);
  const document = await response.json() as FirestoreDocument;
  return { id, data: documentData<T>(document), createTime: document.createTime, updateTime: document.updateTime };
}

export async function listServerDocuments<T>(collection: string): Promise<ServerDocument<T>[]> {
  if (!validDocumentId(collection)) throw new Error('Invalid collection');
  const documents: ServerDocument<T>[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: '500' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await databaseRequest(`documents/${collection}?${query.toString()}`);
    if (response.status === 404) return [];
    if (!response.ok) throw await firestoreFailure(response, `${collection} list failed`);
    const result = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    for (const document of result.documents || []) {
      documents.push({ id: document.name.split('/').pop() || '', data: documentData<T>(document), createTime: document.createTime, updateTime: document.updateTime });
    }
    pageToken = result.nextPageToken || undefined;
  } while (pageToken);
  return documents;
}

export async function createServerDocument<T extends Record<string, unknown>>(collection: string, id: string, data: T): Promise<void> {
  if (!validDocumentId(collection) || !validDocumentId(id)) throw new Error('Invalid document path');
  const query = new URLSearchParams({ 'currentDocument.exists': 'false' });
  const response = await databaseRequest(`documents/${collection}/${encodeURIComponent(id)}?${query.toString()}`, {
    method: 'PATCH', body: JSON.stringify({ fields: documentFields(data) })
  });
  if (!response.ok) throw await firestoreFailure(response, `${collection} create failed`);
}

export async function updateServerDocument<T extends Record<string, unknown>>(collection: string, id: string, data: T, updateTime?: string): Promise<void> {
  if (!validDocumentId(collection) || !validDocumentId(id)) throw new Error('Invalid document path');
  const query = new URLSearchParams();
  if (updateTime) query.set('currentDocument.updateTime', updateTime);
  const suffix = query.size ? `?${query.toString()}` : '';
  const response = await databaseRequest(`documents/${collection}/${encodeURIComponent(id)}${suffix}`, {
    method: 'PATCH', body: JSON.stringify({ fields: documentFields(data) })
  });
  if (!response.ok) throw await firestoreFailure(response, `${collection} update failed`);
}

export async function deleteServerDocument(collection: string, id: string, updateTime?: string): Promise<void> {
  if (!validDocumentId(collection) || !validDocumentId(id)) throw new Error('Invalid document path');
  const query = new URLSearchParams();
  if (updateTime) query.set('currentDocument.updateTime', updateTime);
  const suffix = query.size ? `?${query.toString()}` : '';
  const response = await databaseRequest(`documents/${collection}/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });
  if (!response.ok) throw await firestoreFailure(response, `${collection} delete failed`);
}

export interface ServerCommitWrite {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  exists?: boolean;
  updateTime?: string;
}

export async function commitServerDocuments(writes: ServerCommitWrite[]): Promise<void> {
  const account = credentials();
  const prefix = `projects/${account.project_id}/databases/${FIRESTORE_DATABASE_ID}/documents`;
  const response = await databaseRequest('documents:commit', {
    method: 'POST',
    body: JSON.stringify({
      writes: writes.map((write) => ({
        update: {
          name: `${prefix}/${write.collection}/${write.id}`,
          fields: documentFields(write.data)
        },
        ...(write.updateTime ? { currentDocument: { updateTime: write.updateTime } } :
          write.exists !== undefined ? { currentDocument: { exists: write.exists } } : {})
      }))
    })
  });
  if (!response.ok) throw await firestoreFailure(response, 'Atomic commit failed');
}
