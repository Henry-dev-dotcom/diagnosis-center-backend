const apiUrl = process.env.API_URL || 'http://localhost:5000/api/health';

try {
  const response = await fetch(apiUrl);
  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok || body.success !== true) process.exit(1);
} catch (error) {
  console.error(`Health check failed for ${apiUrl}`);
  console.error(error);
  process.exit(1);
}
