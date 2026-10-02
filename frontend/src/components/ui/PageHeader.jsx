export default function PageHeader({ title, description, action, eyebrow }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-widest text-indigo-600">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-500 sm:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}
