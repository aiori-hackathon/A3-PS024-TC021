import express from 'express';
import { PORTS } from '../common/contract';

const app = express();

app.use((req, res) => {
  res.send(`protected content for ${req.path}`);
});

app.listen(PORTS.origin, '127.0.0.1', () => console.log(`origin listening on ${PORTS.origin}`));
