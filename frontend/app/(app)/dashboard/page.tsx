export const metadata = { title: "Dashboard" };

const hatched =
  "rounded-xl border bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--border)_6px,var(--border)_7px)]";

export default function DashboardPage() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <div className={`${hatched} aspect-video`} />
        <div className={`${hatched} aspect-video`} />
        <div className={`${hatched} aspect-video`} />
      </div>
      <div className={`${hatched} min-h-96 flex-1`} />
    </>
  );
}
