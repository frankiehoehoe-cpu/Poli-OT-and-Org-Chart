import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReviewManagerAnalysis } from './components/review/TaskWorkflow';

export default function ReviewLab() {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b bg-white px-4 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl items-center gap-3"><button onClick={() => navigate('/portal')} className="rounded-xl bg-slate-100 p-2" aria-label="Back to manager portal"><ArrowLeft className="h-5 w-5"/></button><div><h1 className="text-xl font-black">OT Task Workflow Review</h1><p className="text-xs text-slate-500">Manager analytics · review data only</p></div></div></header><main className="mx-auto max-w-7xl p-4 sm:p-8"><ReviewManagerAnalysis/></main></div>;
}
