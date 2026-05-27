#!/bin/bash
set -e

echo "🚀 Starting Topo-Tracer backend..."
cd carno.js
npm run dev &
BACKEND_PID=$!
cd ..

echo "⏳ Waiting for backend to initialize..."
sleep 5

echo "📡 Running sophisticated flow simulation..."
cd sdk/nodejs
SIM_OUTPUT=$(npx ts-node example/sophisticated_flow.ts)
echo "$SIM_OUTPUT"
cd ../..

# Extract Trace ID (Assuming format "Started Trace: <uuid>")
TRACE_ID=$(echo "$SIM_OUTPUT" | grep -oE "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" | head -n 1)

if [ -z "$TRACE_ID" ]; then
  echo "❌ Could not extract Trace ID."
  kill -9 $BACKEND_PID
  exit 1
fi

echo "🔍 Found Trace ID: $TRACE_ID"
echo "⏳ Waiting for backend to materialize zoom levels..."

MAX_RETRIES=10
for ((i=1; i<=MAX_RETRIES; i++)); do
  IS_READY=$(curl -s "http://localhost:3000/telemetry/trace/$TRACE_ID/full" | grep -o '"isZoomReady": true' || true)
  if [ ! -z "$IS_READY" ]; then
    echo "✅ Trace materialization complete!"
    break
  fi
  echo "   Still waiting... ($i/$MAX_RETRIES)"
  sleep 2
done

echo "💾 Saving depth files to temp/..."
mkdir -p temp

for DEPTH in 0 1 2 3; do
  curl -s "http://localhost:3000/telemetry/trace/$TRACE_ID/full?depth=$DEPTH" > temp/depth$DEPTH.json
  echo "   Saved temp/depth$DEPTH.json"
done

echo "🛑 Shutting down backend..."
kill -9 $BACKEND_PID
echo "🎉 Done! You can now load the JSON files in visualizer.html."
