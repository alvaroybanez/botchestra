export function NotFoundPlaceholder() {
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Route Fallback
      </p>
      <h2 className="text-3xl font-semibold tracking-tight">Page not found</h2>
      <p className="max-w-2xl text-muted-foreground">
        The route you requested is not defined in the Botchestra app shell yet.
      </p>
    </section>
  );
}
