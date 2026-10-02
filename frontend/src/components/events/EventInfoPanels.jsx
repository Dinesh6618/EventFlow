import Card from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';

const MEDALS = ['from-amber-400 to-orange-500', 'from-slate-300 to-slate-500', 'from-orange-300 to-amber-700'];

export function PrizesPanel({ prizes }) {
  if (!prizes?.length) {
    return <EmptyState icon="trophy" title="Prizes will be announced" description="The organizer has not listed prizes for this event yet." />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Prizes">
      {prizes.map((prize, i) => (
        <li key={`${prize.title}-${i}`}>
          <Card className="flex h-full items-start gap-4 p-5">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow ${MEDALS[i] || 'from-violet-500 to-indigo-600'}`}>
              <Icon name="trophy" className="h-6 w-6" />
            </span>
            <div>
              <h4 className="font-bold text-slate-900">{prize.title}</h4>
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
    return <EmptyState icon="book" title="No rules published" description="The organizer has not added specific rules. Check the About tab or contact the organizer." />;
  }
  return (
    <ol className="space-y-3" aria-label="Rules">
      {rules.map((rule, i) => (
        <li key={`${i}-${rule}`} className="surface flex items-start gap-4 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-extrabold text-indigo-700">{i + 1}</span>
          <p className="pt-0.5 text-slate-700">{rule}</p>
        </li>
      ))}
    </ol>
  );
}

export function FaqsPanel({ faqs }) {
  if (!faqs?.length) {
    return <EmptyState icon="message" title="No FAQs yet" description="Have a question? Contact the organizer listed on the About tab." />;
  }
  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <details key={`${i}-${faq.question}`} className="surface group p-5 open:shadow-lift">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
            {faq.question}
            <Icon name="chevron-down" className="h-5 w-5 shrink-0 text-indigo-500 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 whitespace-pre-line text-slate-600">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
