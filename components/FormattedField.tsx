import {
  displayOrEmpty,
  splitReviewItems,
} from "@/lib/placeFormat";

type FormattedFieldProps = {
  text: string;
  variant: "hours" | "reviews";
  className?: string;
};

export function OpeningHoursDisplay({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const display = displayOrEmpty(text);
  if (display === "-") {
    return <span className="text-gray-400">-</span>;
  }

  const lines = display.split("\n").filter(Boolean);

  return (
    <div
      className={`max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700 ${className}`}
    >
      {lines.map((line, i) => (
        <p key={i} className={i > 0 ? "mt-1.5 border-t border-gray-100 pt-1.5" : ""}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function ReviewsDisplay({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const display = displayOrEmpty(text);
  if (display === "-") {
    return <span className="text-gray-400">-</span>;
  }

  const items = splitReviewItems(display);

  return (
    <div
      className={`max-h-40 overflow-y-auto space-y-2.5 text-xs leading-relaxed text-gray-700 ${className}`}
    >
      {items.map((item, i) => (
        <p
          key={i}
          className="border-b border-gray-100 pb-2.5 last:border-0 last:pb-0"
        >
          {item}
        </p>
      ))}
    </div>
  );
}

export default function FormattedField({
  text,
  variant,
  className = "",
}: FormattedFieldProps) {
  if (variant === "hours") {
    return <OpeningHoursDisplay text={text} className={className} />;
  }
  return <ReviewsDisplay text={text} className={className} />;
}
