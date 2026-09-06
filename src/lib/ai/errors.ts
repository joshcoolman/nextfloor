/** A model declined to produce the floor. This becomes a dead floor, not an error toast. */
export class RefusalError extends Error {
  constructor(
    message: string,
    readonly category: string | null = null,
  ) {
    super(message);
    this.name = "RefusalError";
  }
}

/** Generation ran but produced something that violates the tile contract. */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}
