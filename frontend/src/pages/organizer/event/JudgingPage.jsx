import { useState } from 'react';
import AssignmentsManager from '../../../components/judging/AssignmentsManager.jsx';
import CriteriaManager from '../../../components/judging/CriteriaManager.jsx';
import LeaderboardManager from '../../../components/judging/LeaderboardManager.jsx';
import ProgressView from '../../../components/judging/ProgressView.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import { useEvent } from './EventManageLayout.jsx';

const SECTIONS = [
  { key: 'criteria', label: 'Criteria' },
  { key: 'judges', label: 'Judges and teams' },
  { key: 'progress', label: 'Progress' },
  { key: 'leaderboard', label: 'Leaderboard' },
];

export default function JudgingPage() {
  const { event, reloadEvent } = useEvent();
  const [section, setSection] = useState('criteria');

  return (
    <div>
      <Tabs tabs={SECTIONS} value={section} onChange={setSection} label="Judging sections" className="mb-6" />
      {section === 'criteria' && <CriteriaManager eventId={event.id} />}
      {section === 'judges' && <AssignmentsManager eventId={event.id} />}
      {section === 'progress' && <ProgressView eventId={event.id} />}
      {section === 'leaderboard' && <LeaderboardManager event={event} onChanged={reloadEvent} />}
    </div>
  );
}
