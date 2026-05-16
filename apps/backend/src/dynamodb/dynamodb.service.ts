import { Injectable } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  QueryCommandInput,
  ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamodbService {
  private readonly client: DynamoDBDocumentClient;

  constructor() {
    const base = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
    this.client = DynamoDBDocumentClient.from(base);
  }

  async get(table: string, key: Record<string, string>) {
    const result = await this.client.send(new GetCommand({ TableName: table, Key: key }));
    return result.Item ?? null;
  }

  async put(table: string, item: Record<string, unknown>) {
    await this.client.send(new PutCommand({ TableName: table, Item: item }));
  }

  async update(table: string, key: Record<string, string>, updates: Record<string, unknown>) {
    const entries = Object.entries(updates);
    const expression = 'SET ' + entries.map((_, i) => `#k${i} = :v${i}`).join(', ');
    const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]));
    const values = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]));
    await this.client.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }

  async removeAttributes(table: string, key: Record<string, string>, attrs: string[]): Promise<void> {
    const expression = 'REMOVE ' + attrs.map((_, i) => `#r${i}`).join(', ');
    const names = Object.fromEntries(attrs.map((a, i) => [`#r${i}`, a]));
    await this.client.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
      }),
    );
  }

  async delete(table: string, key: Record<string, string>) {
    await this.client.send(new DeleteCommand({ TableName: table, Key: key }));
  }

  async query(input: QueryCommandInput) {
    const result = await this.client.send(new QueryCommand(input));
    return { items: result.Items ?? [], lastEvaluatedKey: result.LastEvaluatedKey };
  }

  async scan(input: ScanCommandInput) {
    const result = await this.client.send(new ScanCommand(input));
    return { items: result.Items ?? [], lastEvaluatedKey: result.LastEvaluatedKey };
  }
}
