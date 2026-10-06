export default function PageHeader({ title, description, action, eyebrow }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-medium text-indigo-600">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 sm:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}
