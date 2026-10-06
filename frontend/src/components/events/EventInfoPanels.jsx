import Card from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';

export function PrizesPanel({ prizes }) {
  if (!prizes?.length) {
    return <EmptyState icon="trophy" title="Prizes will be announced" description="The organizer has not listed prizes for this event yet." />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Prizes">
      {prizes.map((prize, i) => (
        <li key={`${prize.title}-${i}`}>
          <Card className="flex h-full items-start gap-3 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon name="trophy" className="h-5 w-5" />
            </span>
            <div>
              <h4 className="text-base font-semibold text-slate-900">{prize.title}</h4>
              {prize.description && <p className="mt-1 text-sm text-slate-600">{prize.description}</p>}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function RulesPanel({ rules }) {
  if (!rules?.length) {
    return <EmptyState icon="book" title="No rules published" description="The organizer has not added specific rules. Check the event description or contact the organizer." />;
  }
  return (
    <ol className="surface divide-y divide-slate-100" aria-label="Rules">
      {rules.map((rule, i) => (
        <li key={`${i}-${rule}`} className="flex items-start gap-3 p-4">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-sm font-medium text-indigo-700">{i + 1}</span>
          <p className="text-sm text-slate-700 sm:text-base">{rule}</p>
        </li>
      ))}
    </ol>
  );
}

export function FaqsPanel({ faqs }) {
  if (!faqs?.length) {
    return <EmptyState icon="message" title="No FAQs yet" description="Have a question? Contact the organizer listed on this page." />;
  }
  return (
    <div className="surface divide-y divide-slate-100">
      {faqs.map((faq, i) => (
        <details key={`${i}-${faq.question}`} className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
            {faq.question}
            <Icon name="chevron-down" className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600 sm:text-base">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
