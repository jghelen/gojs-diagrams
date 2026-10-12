import express, { type ErrorRequestHandler, type Express } from 'express';
import type { Diagram } from './diagrams/diagram.ts';

/** What the app needs from outside. The tests hand in their own. */
export interface AppDependencies {
  /** Gives null when there is no diagram with this id. */
  readDiagram(id: number): Promise<Diagram | null>;
}

/** A whole number above zero, without a sign, a decimal point or leading zeros. */
const ID = /^[1-9]\d{0,14}$/;

export function createApp({ readDiagram }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  // GET /api/diagrams/1: one diagram with its settings, nodes and lines.
  app.get('/api/diagrams/:id', async (request, response) => {
    const { id } = request.params;
    if (!ID.test(id)) {
      response.status(400).json({ error: 'The id of a diagram is a whole number above zero.' });
      return;
    }
    const diagram = await readDiagram(Number(id));
    if (!diagram) {
      response.status(404).json({ error: `There is no diagram with the id ${id}.` });
      return;
    }
    response.json(diagram);
  });

  app.use((_request, response) => {
    response.status(404).json({ error: 'There is nothing at this address.' });
  });

  // What went wrong is for the log; the caller is told only that it did. An
  // error of the database can carry names of tables and pieces of data.
  const onError: ErrorRequestHandler = (error, request, response, next) => {
    console.error(`${request.method} ${request.originalUrl} failed:`, error);
    if (response.headersSent) return next(error);
    response.status(500).json({ error: 'The request could not be answered. Try again later.' });
  };
  app.use(onError);

  return app;
}
