import styles from "./DeadFloor.module.css";
import type { Floor } from "@/lib/ai/types";

/**
 * A floor the models refused or failed to build. Drawn entirely in CSS, so it
 * costs nothing and always renders -- which is the point: a burnt-out floor is
 * a better record of what happened than an error message that scrolls away.
 */
export default function DeadFloor({ floor }: { floor: Floor }) {
  return (
    <div className={styles.dead}>
      <div className={styles.tape} />
      <p className={styles.reason}>
        <strong>FLOOR CONDEMNED</strong>
        {floor.failureReason}
      </p>
    </div>
  );
}
