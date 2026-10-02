import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';

export function SkillChips({ skills, empty = 'No skills listed' }) {
  if (!skills?.length) return <span className="text-xs text-slate-400">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <li key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{s}</li>
      ))}
    </ul>
  );
}

/** Read-only summary of a team. `children` renders actions at the bottom. */
export default function TeamCard({ team, highlight = false, children }) {
  return (
    <Card className={`p-5 ${highlight ? 'ring-2 ring-indigo-500/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar name={team.name} size="lg" className="!rounded-2xl" />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">{team.name}</h3>
            {team.leaderName && <p className="text-xs text-slate-500">Led by {team.leaderName}</p>}
            {team.projectTitle && <p className="text-sm text-slate-500">{team.projectTitle}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={team.isFull ? 'red' : team.isComplete ? 'green' : 'amber'}>
            {team.memberCount}/{team.maxSize} members{team.isFull ? ' (full)' : !team.isComplete ? ` (needs ${team.minSize})` : ''}
          </Badge>
          {team.matchScore > 0 && <Badge tone="indigo">Fits your skills</Badge>}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon name="users" className="h-3.5 w-3.5" />
        {team.members.map((m) => (m.role === 'leader' ? `${m.name} (leader)` : m.name)).join(', ')}
      </p>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-slate-500">Looking for</p>
        <SkillChips skills={team.skills} empty="Not specified" />
        {team.matchedSkills?.length > 0 && (
          <p className="mt-2 text-xs text-indigo-700">
            You cover: {team.matchedSkills.map((m) => m.need).join(', ')}
          </p>
        )}
      </div>

      {children && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">{children}</div>}
    </Card>
  );
}
