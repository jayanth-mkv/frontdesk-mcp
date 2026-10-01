import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { awsCredentials, config } from "../config.js";
import { seedState } from "../domain/seed.js";
import type { HouseholdState } from "../domain/types.js";

/** Household state is small, so it is stored as one document. */
export interface Store {
  load(id: string): Promise<HouseholdState>;
  save(state: HouseholdState): Promise<void>;
}

export class MemoryStore implements Store {
  private states = new Map<string, HouseholdState>();
  async load(id: string) {
    if (!this.states.has(id)) this.states.set(id, { ...seedState(), householdId: id });
    return structuredClone(this.states.get(id)!);
  }
  async save(state: HouseholdState) {
    this.states.set(state.householdId, structuredClone(state));
  }
}

export class DynamoStore implements Store {
  private db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region, credentials: awsCredentials }));
  constructor(private table = config.dynamoTable) {}
  async load(id: string) {
    const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: id } }));
    return (res.Item?.state as HouseholdState) ?? { ...seedState(), householdId: id };
  }
  async save(state: HouseholdState) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { pk: state.householdId, state } }));
  }
}

export const createStore = (): Store => (config.store === "dynamodb" ? new DynamoStore() : new MemoryStore());
