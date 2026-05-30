import { Button } from "./Button";
import { getDisplayQuote } from "@/lib/display-quote";
import type { Recommendation } from "@/lib/types";

export function RecommendationCard({
  recommendation,
  showEdit = true,
}: {
  recommendation: Recommendation;
  showEdit?: boolean;
}) {
  const quote = getDisplayQuote(recommendation);
  const variant = quote ? "story" : "compact";

  return (
    <article
      className={`rec-card rec-card--${variant}`}
      data-testid="recommendation-card"
      data-card-variant={variant}
    >
      <div className="rec-card-body">
        <p className="rec-card-meta">
          {recommendation.city}
          {recommendation.area ? ` · ${recommendation.area}` : ""}
        </p>
        <h2>{recommendation.restaurant}</h2>
        {recommendation.cuisineSummary ? (
          <p className="rec-cuisine">{recommendation.cuisineSummary}</p>
        ) : null}
        {quote ? <blockquote className="rec-quote">{quote}</blockquote> : null}
      </div>

      <div className="rec-card-footer">
        <span className="rec-source">
          {recommendation.sourceName ? `From ${recommendation.sourceName}` : "Community recommendation"}
        </span>
        <div className="footer-actions">
          {recommendation.googleMapsUrl ? (
            <a href={recommendation.googleMapsUrl} rel="noreferrer" target="_blank">
              Maps
            </a>
          ) : null}
          {showEdit ? (
            <Button href={`/recommendation/${recommendation.id}`} variant="secondary">
              View
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
