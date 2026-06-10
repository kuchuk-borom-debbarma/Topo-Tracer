import { Tracer } from '../src';
// import express from 'express'; // Commented out to avoid dependency requirements

/**
 * Express Integration Example
 * 
 * Demonstrates how to use Topo-Tracer as a middleware in Express.
 */

const tracer = new Tracer({
  endpoint: 'http://localhost:3000',
  apiKey: 'dev-key',
  serviceName: 'express-api-service',
});

// Mocking Express for demonstration
const app: any = {
  use: (fn: Function) => { console.log('Registered middleware'); },
  get: (path: string, fn: Function) => { console.log(`Registered GET ${path}`); }
};

// Tracing Middleware
app.use(async (req: any, res: any, next: Function) => {
  const context = tracer.extractContext(req.headers);
  
  await tracer.trace(`${req.method} ${req.path}`, async (span) => {
    span.setAttribute('http.method', req.method);
    
    // Capture the original end method to finish the span
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      span.setAttribute('http.status_code', res.statusCode);
      span.end();
      return originalEnd.apply(this, args);
    };

    next();
  }, { parentContext: context || undefined });
});

app.get('/api/users', (req: any, res: any) => {
  res.json([{ id: 1, name: 'Alice' }]);
});

console.log('Express example defined.');
