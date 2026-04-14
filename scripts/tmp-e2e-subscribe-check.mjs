import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const pool = new pg.Pool({
  host: process.env.SUPERBASE_POOL_HOST,
  port: Number(process.env.SUPERBASE_POOL_PORT || 5432),
  database: process.env.SUPERBASE_POOL_DATABASE || 'postgres',
  user: process.env.SUPERBASE_POOL_USER,
  password: process.env.SUPERBASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    "select id, activation_code from users where activation_code is not null and is_deleted=false order by created_at desc limit 1"
  );

  if (rows.length === 0) {
    console.log('NO_USER');
    process.exit(0);
  }

  const u = rows[0];
  const loginResp = await fetch('https://vicille-server.vercel.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation($passcode:String!){ clientLogin(passcode:$passcode){ accessToken user { id } } }',
      variables: { passcode: u.activation_code },
    }),
  });

  const loginJson = await loginResp.json();
  const token = loginJson?.data?.clientLogin?.accessToken;
  const userId = loginJson?.data?.clientLogin?.user?.id;

  if (!token || !userId) {
    console.log('LOGIN_FAILED');
    console.log(JSON.stringify(loginJson));
    process.exit(0);
  }

  const subscribeUrl = `https://vicelle-pay.vercel.app/subscribe?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
  const subscribeResp = await fetch(subscribeUrl);
  const html = await subscribeResp.text();

  const hasPlanHeading = /available plans|choose your plan|subscription plans|choose plan/i.test(html);
  const hasMissingSession = /subscription link is incomplete|missing the user session details/i.test(html);
  const hasPlanCards = /plan-card|select plan|name=\"planId\"/i.test(html);
  const h1 = (html.match(/<h1[^>]*>(.*?)<\/h1>/i) || [null, ''])[1]
    .replace(/<[^>]+>/g, '')
    .trim();

  console.log('USER_ID=' + userId);
  console.log('TOKEN_PREFIX=' + token.slice(0, 20));
  console.log('SUBSCRIBE_STATUS=' + subscribeResp.status);
  console.log('H1=' + h1);
  console.log('HAS_PLAN_HEADING=' + hasPlanHeading);
  console.log('HAS_PLAN_CARDS=' + hasPlanCards);
  console.log('HAS_MISSING_SESSION=' + hasMissingSession);
} finally {
  await pool.end();
}
