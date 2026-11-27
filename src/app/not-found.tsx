import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="text-6xl font-bold text-accent">404</div>
      <p className="mt-3 text-muted">Такой страницы нет. Возможно, тему переименовали.</p>
      <Link href="/roadmaps" className="mt-6 inline-block rounded-xl bg-accent px-4 py-2 font-medium text-white">
        К роадмапам
      </Link>
    </div>
  );
}
