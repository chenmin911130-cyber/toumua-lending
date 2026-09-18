const POINTS = [
  {
    title: "One office process",
    body: "Application, valuation, decision, custody, and cashiering sit in the same workspace so a file is easy to follow.",
  },
  {
    title: "Written figures on the offer",
    body: "The homepage calculator is an illustration only. A formal offer would confirm rate, fees, and the total amount payable.",
  },
  {
    title: "Repay in the office",
    body: "This website does not take online payments. Receipts are recorded by the cashier after money is received in person.",
  },
] as const;

export function Testimonials() {
  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-5">
      {POINTS.map((item) => (
        <article key={item.title} className="rounded-[16px] bg-white p-6 shadow-[0_8px_24px_rgba(16,24,40,0.05)]">
          <h3 className="text-[17px] font-semibold text-text">{item.title}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">{item.body}</p>
        </article>
      ))}
    </div>
  );
}
