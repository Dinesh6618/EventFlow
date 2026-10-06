import Button from '../ui/Button.jsx';
import { Input, Textarea } from '../ui/FormField.jsx';
import Icon from '../ui/Icon.jsx';

function Shell({ title, hint, addLabel, onAdd, max, count, children }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 p-4">
      <legend className="px-2 text-sm font-bold text-slate-800">{title}</legend>
      {hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}
      <div className="space-y-4">{children}</div>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onAdd} disabled={count >= max}>
        <Icon name="plus" className="h-4 w-4" />
        {addLabel}
      </Button>
      {count >= max && <p className="mt-2 text-xs text-slate-500">That is the maximum ({max}).</p>}
    </fieldset>
  );
}

function RemoveButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="mt-7 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
      <Icon name="trash" className="h-4 w-4" />
    </button>
  );
}

/** Prizes: [{ title, description }] */
export function PrizesEditor({ value, onChange, errors = {} }) {
  const update = (i, patch) => onChange(value.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <Shell title="Prizes" hint="Shown on the event page, in the order you list them." addLabel="Add a prize" max={10} count={value.length} onAdd={() => onChange([...value, { title: '', description: '' }])}>
      {value.map((prize, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Input label={`Prize ${i + 1}`} maxLength={100} value={prize.title} onChange={(e) => update(i, { title: e.target.value })} error={errors[`prizes.${i}.title`]} placeholder="e.g. First place" />
            <Input label="Details" maxLength={300} value={prize.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="e.g. Cash prize and goodies" />
          </div>
          <RemoveButton label={`Remove prize ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))} />
        </div>
      ))}
    </Shell>
  );
}

/** Rules: [string] */
export function RulesEditor({ value, onChange, errors = {} }) {
  return (
    <Shell title="Rules" hint="One rule per line item." addLabel="Add a rule" max={20} count={value.length} onAdd={() => onChange([...value, ''])}>
      {value.map((rule, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex-1">
            <Input label={`Rule ${i + 1}`} maxLength={300} value={rule} onChange={(e) => onChange(value.map((r, k) => (k === i ? e.target.value : r)))} error={errors[`rules.${i}`]} placeholder="e.g. Bring your college ID" />
          </div>
          <RemoveButton label={`Remove rule ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))} />
        </div>
      ))}
    </Shell>
  );
}

/** FAQs: [{ question, answer }] */
export function FaqsEditor({ value, onChange, errors = {} }) {
  const update = (i, patch) => onChange(value.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  return (
    <Shell title="FAQs" hint="Answer the questions students ask most." addLabel="Add a question" max={15} count={value.length} onAdd={() => onChange([...value, { question: '', answer: '' }])}>
      {value.map((faq, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex-1 space-y-3">
            <Input label={`Question ${i + 1}`} maxLength={200} value={faq.question} onChange={(e) => update(i, { question: e.target.value })} error={errors[`faqs.${i}.question`]} />
            <Textarea label="Answer" rows={2} maxLength={1000} value={faq.answer} onChange={(e) => update(i, { answer: e.target.value })} error={errors[`faqs.${i}.answer`]} />
          </div>
          <RemoveButton label={`Remove question ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))} />
        </div>
      ))}
    </Shell>
  );
}
