import { Button } from "./Button";
import { getDisplayQuote } from "@/lib/display-quote";
import { formatSourceNames } from "@/lib/display-source";
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
  const location = [recommendation.area, recommendation.city].filter(Boolean).join(" / ");
  const sourceNames = formatSourceNames(recommendation.sourceName);

  return (
    <article
      className={`rec-card rec-card--${variant}`}
      data-testid="recommendation-card"
      data-card-variant={variant}
    >
      <div className="rec-card-body">
        <div className="rec-card-main">
          <p className="rec-card-meta rec-location">{location || recommendation.city}</p>
          <h2>{recommendation.restaurant}</h2>
          {recommendation.cuisineSummary ? <p className="rec-cuisine">{recommendation.cuisineSummary}</p> : null}
        </div>
        {quote ? <blockquote className="rec-quote">{quote}</blockquote> : null}
      </div>

      <div className="rec-card-footer">
        <span className="rec-source">
          {sourceNames ? `Recommended by ${sourceNames}` : "Recommended by the community"}
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
