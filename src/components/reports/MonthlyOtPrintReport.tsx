import React from 'react';

export interface MonthlyOtPrintRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  typeLabel: string;
  statusLabel: string;
  remarks: string;
}

interface ManagerSignature {
  data: string;
  type: string;
  signedBy?: string;
}

interface SupervisorApproval {
  signature?: string;
  type?: string;
  signedBy?: string;
}

interface MonthlyOtPrintReportProps {
  employeeName: string;
  month: string;
  rows: MonthlyOtPrintRow[];
  onePointFiveHours: number;
  doubleTimeHours: number;
  confirmed: boolean;
  managerSignature?: ManagerSignature | null;
  supervisorApproval?: SupervisorApproval | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} (${DAY_NAMES[weekday]})`;
}

function timeLabel(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value || '—';
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function SignatureMark({ data, type }: { data: string; type: string }) {
  if (!data) return <span className="ot-print-signature-pending">Awaiting signature / 待签名</span>;
  if (type === 'text') {
    return <span className="ot-print-signature-text" translate="no">{data}</span>;
  }
  return <img src={data} alt="Signed signature / 已签名" className="ot-print-signature-image" />;
}

/**
 * A dedicated print-only document. It uses the same authoritative Monthly OT rows
 * already displayed by ManagerPortal; it never writes to or recalculates OT data.
 */
export default function MonthlyOtPrintReport({
  employeeName,
  month,
  rows,
  onePointFiveHours,
  doubleTimeHours,
  confirmed,
  managerSignature,
  supervisorApproval,
}: MonthlyOtPrintReportProps) {
  const printDensity = rows.length <= 22
    ? 'ot-print-fit-page ot-print-density-regular'
    : rows.length <= 31
      ? 'ot-print-fit-page ot-print-density-tight'
      : 'ot-print-density-flow';

  return (
    <section className={`ot-monthly-print-document ${printDensity}`} aria-label="Monthly OT report / 月度加班报告">
      <div className="ot-print-heading">
        <div>
          <p className="ot-print-kicker">OT PRO · MONTHLY OVERTIME REPORT / 月度加班报告</p>
          <h1 translate="no">{employeeName}</h1>
          <p className="ot-print-meta">Reporting month / 报告月份: <strong>{month}</strong></p>
        </div>
        <div className="ot-print-heading-status">
          <strong>{confirmed ? 'CONFIRMED / 已确认' : 'PENDING / 待确认'}</strong>
          <span>{rows.length} record{rows.length === 1 ? '' : 's'} / 记录</span>
        </div>
      </div>

      <table className="ot-print-table">
        <colgroup>
          <col style={{ width: '19%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '17%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Date / 日期</th>
            <th>Time / 时间</th>
            <th>Rate / 倍率</th>
            <th>Hours / 时长</th>
            <th>Status / 状态</th>
            <th>Remarks / 备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="ot-print-date">{dateLabel(row.date)}</td>
              <td className="ot-print-time">
                {row.startTime && row.endTime
                  ? `${timeLabel(row.startTime)} – ${timeLabel(row.endTime)}`
                  : '—'}
              </td>
              <td>{row.typeLabel}</td>
              <td className="ot-print-hours">{row.totalHours.toFixed(1)}h</td>
              <td>{row.statusLabel}</td>
              <td className="ot-print-remarks">{row.remarks || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="ot-print-empty">No OT or work-hour records for this month / 本月暂无加班或工时记录</td></tr>
          )}
        </tbody>
      </table>

      {/* Total + both signature blocks must travel together to the last page. */}
      <div className="ot-print-closing">
        <div className="ot-print-totals">
          <div>
            <span>1.5× OT / 1.5倍加班</span>
            <strong>{onePointFiveHours.toFixed(1)}h</strong>
            <small>Included in 72h cap / 计入72小时</small>
          </div>
          <div>
            <span>2.0× OT / 2.0倍加班</span>
            <strong>{doubleTimeHours.toFixed(1)}h</strong>
            <small>Excluded from 72h cap / 不计入72小时</small>
          </div>
        </div>
        <div className="ot-print-approval-heading">APPROVAL &amp; SIGNATURES / 审核及签名</div>
        <div className="ot-print-signatures">
          <div className="ot-print-signature-box">
            <p className="ot-print-signature-title">SUPERVISOR / 主管</p>
            <div className="ot-print-signature-space">
              {supervisorApproval?.signature
                ? <SignatureMark data={supervisorApproval.signature} type={supervisorApproval.type || 'draw'} />
                : <span className="ot-print-signature-pending">Awaiting approval / 待审核</span>}
            </div>
            <p className="ot-print-signature-caption">
              {supervisorApproval?.signedBy || 'Supervisor Signature / 主管签名'}
            </p>
            <p className="ot-print-signature-status">{supervisorApproval?.signature ? 'SIGNED / 已签署' : 'PENDING / 待签署'}</p>
          </div>
          <div className="ot-print-signature-box">
            <p className="ot-print-signature-title">MANAGER / 经理</p>
            <div className="ot-print-signature-space">
              {confirmed && managerSignature?.data
                ? <SignatureMark data={managerSignature.data} type={managerSignature.type} />
                : <span className="ot-print-signature-pending">Awaiting manager signature / 待经理签名</span>}
            </div>
            <p className="ot-print-signature-caption" translate="no">{managerSignature?.signedBy || 'Manager Signature / 经理签名'}</p>
            <p className="ot-print-signature-status">{confirmed && managerSignature?.data ? 'SIGNED / 已签署' : 'PENDING / 待签署'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
