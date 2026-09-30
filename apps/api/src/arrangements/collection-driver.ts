export type CollectionRequest = {
  amount: string;
  reference: string;
};

export type CollectionResult =
  | { ok: true; externalReference: string }
  | { ok: false; reason: string };

/** A bank pull. The simulated driver is the only implementation; no live bank is called. */
export interface CollectionDriver {
  collect(input: CollectionRequest): Promise<CollectionResult>;
}

export class SimulatedCollectionDriver implements CollectionDriver {
  async collect(input: CollectionRequest): Promise<CollectionResult> {
    const mode = (process.env.COLLECTION_SIMULATE ?? "success").toLowerCase();
    if (mode === "failure") {
      return { ok: false, reason: "The simulated bank declined the collection" };
    }
    return { ok: true, externalReference: `SIM-${input.reference.slice(0, 24)}` };
  }
}
