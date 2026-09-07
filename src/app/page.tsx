import Tower from "@/components/Tower";
import { listFloors } from "@/lib/db/floors";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Render the elevator's complete panel before hydration or the browser's
  // metadata request. Only its small navigation manifest crosses the boundary.
  const floors = await listFloors().catch((error) => {
    console.error("Could not preload elevator buttons", error);
    return [];
  });
  const visible = floors.filter((floor) => !floor.isReference && (floor.status !== "dead" || floor.meta?.kept === true));
  return <Tower initialArrival={{
    ordinals: visible.filter((floor) => floor.kind === "floor").map((floor) => floor.ordinal),
    hasRoof: visible.some((floor) => floor.kind === "roof"),
  }} />;
}
