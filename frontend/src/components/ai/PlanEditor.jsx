import { SESSION_TYPES, EVENT_TYPES } from '../../utils/constants.js';
import { getIn, setIn } from '../../utils/objectPath.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Checkbox, Input, Select, Textarea } from '../ui/FormField.jsx';

const SESSION_OPTIONS = Object.keys(SESSION_TYPES);

/** Shared by every field: reads its value from the plan and reports a change by path. */
function useBinding({ plan, onChange, errors, readOnly }) {
  return (path) => ({
    value: getIn(plan, path) ?? '',
    error: errors[path],
    disabled: readOnly,
    onChange: (e) => onChange(setIn(plan, path, e.target.value)),
  });
}

/** One-per-line list of short strings, kept as an array in the plan. */
function Lines({ label, hint, items, error, disabled, onChange }) {
  return (
    <Textarea
      label={label}
      hint={hint ?? 'One per line'}
      rows={Math.max(3, items.length + 1)}
      value={items.join('\n')}
      error={error}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.split('\n'))}
    />
  );
}

/** A list of small records: one bordered card each, with add / remove. */
function RecordList({ title, items, onChange, blank, readOnly, addLabel, errors, basePath, children }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const itemErrors = Object.keys(errors).filter((k) => k.startsWith(`${basePath}.${i}.`)).length;
        return (
          <Card key={i} className={`p-4 ${itemErrors ? 'ring-1 ring-red-300' : ''}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">{title} {i + 1}</p>
              {!readOnly && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onChange(items.filter((_, k) => k !== i))}>Remove</Button>}
            </div>
            {children(item, i)}
          </Card>
        );
      })}
      {!readOnly && <Button variant="secondary" size="sm" onClick={() => onChange([...items, blank()])}>{addLabel}</Button>}
    </div>
  );
}

function Section({ id, title, description, count, errorCount, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">{title}</h2>
        {count !== undefined && <Badge tone="slate">{count}</Badge>}
        {errorCount > 0 && <Badge tone="red">{errorCount} to fix</Badge>}
      </div>
      {description && <p className="-mt-1 mb-3 text-sm text-slate-500">{description}</p>}
      {children}
    </section>
  );
}

export const PLAN_SECTIONS = [
  ['overview', 'Overview'],
  ['schedule', 'Schedule'],
  ['registration', 'Registration'],
  ['teams', 'Teams'],
  ['volunteers', 'Volunteers'],
  ['judging', 'Judging'],
  ['resources', 'Resources'],
  ['communication', 'Communication'],
  ['risks', 'Risks'],
];

const countErrors = (errors, ...prefixes) => Object.keys(errors).filter((k) => prefixes.some((p) => k === p || k.startsWith(`${p}.`))).length;

/**
 * Editor for every part of an AI plan. `plan` is controlled; `onChange(nextPlan)` reports edits.
 * Errors come from the server as { 'schedule.2.endTime': 'message' }.
 */
export default function PlanEditor({ plan, onChange, errors = {}, readOnly = false }) {
  const bind = useBinding({ plan, onChange, errors, readOnly });
  const field = (path) => bind(path);
  const number = (path) => ({ ...bind(path), type: 'number', inputMode: 'decimal', onChange: (e) => onChange(setIn(plan, path, e.target.value === '' ? '' : Number(e.target.value))) });
  const list = (path) => (items) => onChange(setIn(plan, path, items));

  const criteriaTotal = plan.judging.criteria.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);

  return (
    <div className="space-y-10">
      <Section id="overview" title="Overview" errorCount={countErrors(errors, 'title', 'summary', 'eventType', 'structure')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Event name" {...field('title')} maxLength={150} /></div>
          <div className="sm:col-span-2"><Textarea label="Summary" rows={3} {...field('summary')} /></div>
          <Select label="Event type" options={EVENT_TYPES} {...field('eventType')} />
          <Input label="Format" {...field('structure.format')} hint="How the event runs, in a sentence" />
          <Input label="Duration (hours)" min="0.5" {...number('structure.durationHours')} />
          <Input label="Days" min="1" max="14" {...number('structure.days')} />
          <Input label="Expected participants" min="1" {...number('structure.expectedParticipants')} />
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Event structure</h3>
        <RecordList title="Phase" items={plan.structure.phases} onChange={list('structure.phases')} blank={() => ({ name: '', description: '' })} addLabel="Add a phase" readOnly={readOnly} errors={errors} basePath="structure.phases">
          {(_, i) => (
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <Input label="Name" {...field(`structure.phases.${i}.name`)} />
              <Input label="What happens" {...field(`structure.phases.${i}.description`)} />
            </div>
          )}
        </RecordList>
      </Section>

      <Section id="schedule" title="Schedule" count={plan.schedule.length} errorCount={countErrors(errors, 'schedule')} description="Day 1 is the first day. Sessions on a day must not overlap and cannot run past midnight.">
        <RecordList title="Session" items={plan.schedule} onChange={list('schedule')} readOnly={readOnly} errors={errors} basePath="schedule" addLabel="Add a session"
          blank={() => ({ day: 1, startTime: '09:00', endTime: '10:00', title: '', description: '', sessionType: 'session', venueHint: '', speakerHint: '' })}>
          {(_, i) => (
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-4"><Input label="Title" {...field(`schedule.${i}.title`)} /></div>
              <div className="sm:col-span-2"><Select label="Type" options={SESSION_OPTIONS} {...field(`schedule.${i}.sessionType`)} /></div>
              <Input label="Day" min="1" {...number(`schedule.${i}.day`)} />
              <Input label="Start" type="time" {...field(`schedule.${i}.startTime`)} />
              <Input label="End" type="time" {...field(`schedule.${i}.endTime`)} />
              <div className="sm:col-span-3"><Input label="Venue" {...field(`schedule.${i}.venueHint`)} /></div>
              <div className="sm:col-span-3"><Input label="Speaker" {...field(`schedule.${i}.speakerHint`)} /></div>
              <div className="sm:col-span-6"><Input label="Details" {...field(`schedule.${i}.description`)} /></div>
            </div>
          )}
        </RecordList>
        {!readOnly && plan.schedule.length > 1 && (
          <Button className="mt-3" variant="ghost" size="sm" onClick={() => onChange({ ...plan, schedule: [...plan.schedule].sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime)) })}>
            Sort by day and time
          </Button>
        )}
      </Section>

      <Section id="registration" title="Registration" errorCount={countErrors(errors, 'registration')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Maximum participants" min="1" {...number('registration.maxParticipants')} />
          <Input label="Close registration (days before the event)" min="0" {...number('registration.deadlineDaysBeforeEvent')} />
          <div className="sm:col-span-2">
            <Checkbox label="Organizer approves each registration" hint="New registrations wait as pending until approved." checked={plan.registration.requiresApproval} disabled={readOnly}
              onChange={(e) => onChange(setIn(plan, 'registration.requiresApproval', e.target.checked))} />
          </div>
          <div className="sm:col-span-2">
            <Lines label="Requirements for participants" items={plan.registration.requirements} error={errors['registration.requirements']} disabled={readOnly} onChange={list('registration.requirements')} />
          </div>
        </div>
      </Section>

      <Section id="teams" title="Teams" errorCount={countErrors(errors, 'team')}>
        <Checkbox label="Participants form teams" checked={plan.team.enabled} disabled={readOnly} onChange={(e) => onChange(setIn(plan, 'team.enabled', e.target.checked))} />
        {plan.team.enabled && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Minimum team size" min="1" {...number('team.minSize')} />
            <Input label="Maximum team size" min="1" max="50" {...number('team.maxSize')} />
            <div className="sm:col-span-2">
              <Checkbox label="Allow a participant to be in more than one team" checked={plan.team.allowMultipleTeams} disabled={readOnly} onChange={(e) => onChange(setIn(plan, 'team.allowMultipleTeams', e.target.checked))} />
            </div>
          </div>
        )}
      </Section>

      <Section id="volunteers" title="Volunteers" errorCount={countErrors(errors, 'volunteers')}>
        <div className="mb-4 max-w-xs"><Input label="Volunteers needed in total" min="0" {...number('volunteers.total')} /></div>
        <RecordList title="Role" items={plan.volunteers.roles} onChange={list('volunteers.roles')} readOnly={readOnly} errors={errors} basePath="volunteers.roles" addLabel="Add a role" blank={() => ({ role: '', count: 1, responsibilities: '' })}>
          {(_, i) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem_2fr]">
              <Input label="Role" {...field(`volunteers.roles.${i}.role`)} />
              <Input label="How many" min="0" {...number(`volunteers.roles.${i}.count`)} />
              <Input label="Responsibilities" {...field(`volunteers.roles.${i}.responsibilities`)} />
            </div>
          )}
        </RecordList>
      </Section>

      <Section id="judging" title="Judging criteria" errorCount={countErrors(errors, 'judging')} description="These become the scoring criteria when you publish.">
        <div className="mb-4 max-w-xs"><Input label="Judges needed" min="0" {...number('judging.judgesNeeded')} /></div>
        <RecordList title="Criterion" items={plan.judging.criteria} onChange={list('judging.criteria')} readOnly={readOnly} errors={errors} basePath="judging.criteria" addLabel="Add a criterion" blank={() => ({ name: '', maxScore: 10, description: '' })}>
          {(_, i) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_2fr]">
              <Input label="Name" {...field(`judging.criteria.${i}.name`)} />
              <Input label="Max score" min="1" {...number(`judging.criteria.${i}.maxScore`)} />
              <Input label="What judges look for" {...field(`judging.criteria.${i}.description`)} />
            </div>
          )}
        </RecordList>
        {plan.judging.criteria.length > 0 && <p className="mt-3 text-sm text-slate-600">Total points: <strong className={criteriaTotal === 100 ? 'text-emerald-700' : 'text-amber-700'}>{criteriaTotal}</strong>{criteriaTotal !== 100 && ' (100 is usual)'}</p>}
      </Section>

      <Section id="resources" title="Required resources" count={plan.resources.length} errorCount={countErrors(errors, 'resources')}>
        <RecordList title="Group" items={plan.resources} onChange={list('resources')} readOnly={readOnly} errors={errors} basePath="resources" addLabel="Add a resource group" blank={() => ({ category: '', items: [''] })}>
          {(item, i) => (
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <Input label="Category" {...field(`resources.${i}.category`)} />
              <Lines label="Items" items={item.items} error={errors[`resources.${i}.items`]} disabled={readOnly} onChange={list(`resources.${i}.items`)} />
            </div>
          )}
        </RecordList>
      </Section>

      <Section id="communication" title="Communication plan" count={plan.communicationPlan.length} errorCount={countErrors(errors, 'communicationPlan')}>
        <RecordList title="Step" items={plan.communicationPlan} onChange={list('communicationPlan')} readOnly={readOnly} errors={errors} basePath="communicationPlan" addLabel="Add a step" blank={() => ({ when: '', channel: '', message: '' })}>
          {(_, i) => (
            <div className="grid gap-3 sm:grid-cols-[12rem_10rem_1fr]">
              <Input label="When" {...field(`communicationPlan.${i}.when`)} />
              <Input label="Channel" {...field(`communicationPlan.${i}.channel`)} />
              <Input label="Message" {...field(`communicationPlan.${i}.message`)} />
            </div>
          )}
        </RecordList>
      </Section>

      <Section id="risks" title="Risk checklist" count={plan.riskChecklist.length} errorCount={countErrors(errors, 'riskChecklist')}>
        <RecordList title="Risk" items={plan.riskChecklist} onChange={list('riskChecklist')} readOnly={readOnly} errors={errors} basePath="riskChecklist" addLabel="Add a risk" blank={() => ({ risk: '', likelihood: 'medium', mitigation: '' })}>
          {(_, i) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem_1fr]">
              <Input label="Risk" {...field(`riskChecklist.${i}.risk`)} />
              <Select label="Likelihood" options={['low', 'medium', 'high']} {...field(`riskChecklist.${i}.likelihood`)} />
              <Input label="Mitigation" {...field(`riskChecklist.${i}.mitigation`)} />
            </div>
          )}
        </RecordList>
      </Section>
    </div>
  );
}

/** Tidy what the organizer typed before it is sent: trim text, drop blank lines, make numbers real numbers. */
export function cleanPlan(plan) {
  const text = (v) => (typeof v === 'string' ? v.trim() : v);
  const strings = (list) => list.map(text).filter(Boolean);
  const n = (v) => (v === '' || v === null ? v : Number(v));
  return {
    ...plan,
    title: text(plan.title),
    summary: text(plan.summary),
    structure: { ...plan.structure, format: text(plan.structure.format), durationHours: n(plan.structure.durationHours), days: n(plan.structure.days), expectedParticipants: n(plan.structure.expectedParticipants), phases: plan.structure.phases.filter((p) => p.name.trim() || p.description.trim()) },
    schedule: plan.schedule.map((s) => ({ ...s, day: n(s.day), title: text(s.title), description: text(s.description), venueHint: text(s.venueHint), speakerHint: text(s.speakerHint) })),
    registration: { ...plan.registration, maxParticipants: n(plan.registration.maxParticipants), deadlineDaysBeforeEvent: n(plan.registration.deadlineDaysBeforeEvent), requirements: strings(plan.registration.requirements) },
    team: { ...plan.team, minSize: n(plan.team.minSize), maxSize: n(plan.team.maxSize) },
    volunteers: { total: n(plan.volunteers.total), roles: plan.volunteers.roles.map((r) => ({ ...r, role: text(r.role), count: n(r.count), responsibilities: text(r.responsibilities) })) },
    judging: { judgesNeeded: n(plan.judging.judgesNeeded), criteria: plan.judging.criteria.map((c) => ({ ...c, name: text(c.name), maxScore: n(c.maxScore), description: text(c.description) })) },
    resources: plan.resources.map((r) => ({ category: text(r.category), items: strings(r.items) })),
    communicationPlan: plan.communicationPlan.map((c) => ({ when: text(c.when), channel: text(c.channel), message: text(c.message) })),
    riskChecklist: plan.riskChecklist.map((r) => ({ ...r, risk: text(r.risk), mitigation: text(r.mitigation) })),
  };
}
