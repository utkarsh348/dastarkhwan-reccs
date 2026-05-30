import { RecommendationForm } from "@/components/RecommendationForm";

export default function AddRecommendationPage() {
  return (
    <main className="page-shell" data-testid="add-page">
      <section className="page-header">
        <p className="eyebrow">Quick add</p>
        <h1>Add a recommendation.</h1>
        <p>Keep it light: restaurant, city, and what to order are enough. A Maps link helps everyone later.</p>
      </section>
      <RecommendationForm />
    </main>
  );
}
