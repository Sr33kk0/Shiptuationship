export default function LogInButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <a className={className} href="/login">
      {children}
    </a>
  );
}
