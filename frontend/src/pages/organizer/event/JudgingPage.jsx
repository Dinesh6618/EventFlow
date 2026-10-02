import { useState } from 'react';
import AssignmentsManager from '../../../components/judging/AssignmentsManager.jsx';
import CriteriaManager from '../../../components/judging/CriteriaManager.jsx';
import LeaderboardManager from '../../../components/judging/LeaderboardManager.jsx';
import ProgressView from '../../../components/judging/ProgressView.jsx';
import { useEvent } from './EventManageLayout.jsx';

const SECTIONS = [
  ['criteria', 'Criteria'],
  ['judges', 'Judges and teams'],
  ['progress', 'Progress'],
  ['leaderboard', 'Leaderboard'],
];

export default function JudgingPage() {
  const { event, reloadEvent } = useEvent();
  const [section, setSection] = useState('criteria');

  return (
    <div>
      <div role="tablist" aria-label="Judging sections" className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={section === key}
            onClick={() => setSection(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${section === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {section === 'criteria' && <CriteriaManager eventId={event.id} />}
      {section === 'judges' && <AssignmentsManager eventId={event.id} />}
      {section === 'progress' && <ProgressView eventId={event.id} />}
      {section === 'leaderboard' && <LeaderboardManager event={event} onChanged={reloadEvent} />}
    </div>
  );
}
