import { Star } from "lucide-react";
import { motion } from "framer-motion";

const REVIEWS = [
  {
    quote:
      "The team at Toumu'a made the whole process easy and stress-free. Highly recommend!",
    name: "Sarah T.",
    location: "Auckland",
  },
  {
    quote: "Fast, clear and genuinely helpful. I felt supported every step of the way.",
    name: "James L.",
    location: "Wellington",
  },
  {
    quote: "Great experience from start to finish. Transparent and professional.",
    name: "Mere K.",
    location: "Christchurch",
  },
] as const;

export function Testimonials() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {REVIEWS.map((review, index) => (
        <motion.blockquote
          key={review.name}
          className="rounded-[16px] bg-white p-5 shadow-[0_8px_24px_rgba(16,24,40,0.05)]"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: index * 0.08 }}
        >
          <p className="text-[15px] leading-relaxed text-text-secondary">&ldquo;{review.quote}&rdquo;</p>
          <div className="mt-4 flex gap-0.5 text-primary" aria-label="5 out of 5 stars">
            {Array.from({ length: 5 }).map((_, star) => (
              <Star key={star} className="h-4 w-4 fill-primary" strokeWidth={0} aria-hidden />
            ))}
          </div>
          <footer className="mt-4">
            <p className="text-[15px] font-semibold text-text">{review.name}</p>
            <p className="text-[14px] text-text-muted">{review.location}</p>
          </footer>
        </motion.blockquote>
      ))}
    </div>
  );
}
