import styles from "./DeadFloor.module.css";
import type { Floor } from "@/lib/ai/types";

/**
 * A floor that was refused or failed to build, and that someone asked to look
 * at. One fixed piece of artwork stands in for every failure: a burnt-out
 * storey is a better record of what happened than an error message that
 * scrolls away, and it costs nothing to draw. It stands only until the next
 * floor is built over it. The reason is a tooltip rather than a caption -- a
 * condemned floor should be something you find and wonder about, not something
 * that explains itself.
 */
export default function DeadFloor({ floor }: { floor: Floor }) {
  return (
    <div className={styles.dead} title={floor.failureReason ?? "Condemned."}>
      <img src="/condemned-floor.png" alt="A condemned floor" draggable={false} />
    </div>
  );
}
