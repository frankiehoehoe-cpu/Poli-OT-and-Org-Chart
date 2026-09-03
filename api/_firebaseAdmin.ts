import { createSign, scryptSync, timingSafeEqual } from 'node:crypto';

interface ServiceAccount { project_id: string; client_email: string; private_key: string }
interface FirestoreValue { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number }
interface FirestoreDocument { name: string; fields?: Record<string, FirestoreValue> }

let cachedToken: { value: string; expiresAt: number } | null = null;

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
  const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${base64url(signer.sign(account.private_key))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new Error(`Firebase credential exchange failed (${response.status})`);
  const result = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

async function firestore(path: string): Promise<Response> {
  const account = credentials();
  const token = await accessToken();
  return fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/databases/(default)/documents/${path}`, { headers: { authorization: `Bearer ${token}` } });
}

const value = (field?: FirestoreValue): unknown => field?.stringValue ?? field?.booleanValue ?? (field?.integerValue ? Number(field.integerValue) : field?.doubleValue);

export interface ServerEmployee { id: string; name: string; role: string; department?: string; password?: string; passwordHash?: string }

function employee(document: FirestoreDocument): ServerEmployee {
  const fields = document.fields || {};
  return { id: document.name.split('/').pop() || '', name: String(value(fields.name) || ''), role: String(value(fields.role) || 'employee'), department: value(fields.department) as string | undefined, password: value(fields.password) as string | undefined, passwordHash: value(fields.passwordHash) as string | undefined };
}

export async function listEmployees(): Promise<ServerEmployee[]> {
  const response = await firestore('employees?pageSize=500&orderBy=name');
  if (!response.ok) throw new Error(`Employee lookup failed (${response.status})`);
  const result = await response.json() as { documents?: FirestoreDocument[] };
  return (result.documents || []).map(employee);
}

export async function getEmployee(id: string): Promise<ServerEmployee | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const response = await firestore(`employees/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Employee lookup failed (${response.status})`);
  return employee(await response.json() as FirestoreDocument);
}

function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
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

export const publicEmployee = (employee: ServerEmployee) => ({ id: employee.id, name: employee.name, role: employee.role, ...(employee.department ? { department: employee.department } : {}) });
