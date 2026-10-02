export default function Card({ className = '', hover = false, children, ...props }) {
  return (
    <div className={`surface ${hover ? 'surface-lift' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}
