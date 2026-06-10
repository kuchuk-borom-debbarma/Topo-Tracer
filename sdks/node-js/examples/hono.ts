import { Hono } from 'hono';
import { Tracer } from '../src';

/**
 * Hono Integration Example
 * 
 * Demonstrates how to use Topo-Tracer as a middleware in Hono.
 */

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'dev-key',
  serviceName: 'hono-api-service',
});

const app = new Hono();

// Tracing Middleware
app.use('*', async (c, next) => {
  const context = tracer.extractContext(c.req.header());
  
  return await tracer.trace(`${c.req.method} ${c.req.path}`, async (span) => {
    span.setAttribute('http.method', c.req.method);
    span.setAttribute('http.url', c.req.url);
    
    await next();
    
    span.setAttribute('http.status_code', c.res.status);
  }, { parentContext: context || undefined });
});

app.get('/hello', (c) => {
  return c.text('Hello Topo-Tracer!');
});

app.get('/data', async (c) => {
  return await tracer.trace('fetch-data-op', async (span) => {
    // Simulated database call
    await new Promise(r => setTimeout(r, 50));
    span.setAttribute('db.query', 'SELECT * FROM users');
    return c.json({ data: [1, 2, 3] });
  });
});

// For demonstration purposes, we don't start the server
console.log('Hono example defined. In a real app, you would use:');
console.log('export default app;');
