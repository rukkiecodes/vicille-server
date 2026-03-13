# Database State Export

- Generated at: 2026-03-13T06:23:28.408Z
- Schema: public
- Database: postgres

## Tables (34)

### accessories

- Rows: 0
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | text | NO |  |
| 3 | category | text | YES |  |
| 4 | description | text | YES |  |
| 5 | price | numeric | NO | 0 |
| 6 | image_url | text | YES |  |
| 7 | is_available | boolean | YES | true |
| 8 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### accessory_orders

- Rows: 0
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | order_id | uuid | NO |  |
| 4 | accessory_id | uuid | NO |  |
| 5 | quantity | integer | YES | 1 |
| 6 | price | numeric | NO |  |
| 7 | status | text | YES | 'pending'::text |
| 8 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### admins

- Rows: 0
- Columns: 13

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | full_name | text | NO |  |
| 3 | email | text | NO |  |
| 4 | password_hash | text | NO |  |
| 5 | phone | text | YES |  |
| 6 | role | text | NO | 'admin'::text |
| 7 | profile_photo_url | text | YES |  |
| 8 | is_active | boolean | YES | true |
| 9 | created_by | uuid | YES |  |
| 10 | last_login_at | timestamp with time zone | YES |  |
| 11 | is_deleted | boolean | NO | false |
| 12 | created_at | timestamp with time zone | NO | now() |
| 13 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### audit_logs

- Rows: 0
- Columns: 11

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | entity_type | text | NO |  |
| 3 | entity_id | uuid | YES |  |
| 4 | action | text | NO |  |
| 5 | performed_by_id | uuid | YES |  |
| 6 | performed_by_role | text | YES |  |
| 7 | before_data | jsonb | YES |  |
| 8 | after_data | jsonb | YES |  |
| 9 | ip_address | text | YES |  |
| 10 | notes | text | YES |  |
| 11 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### collection_items

- Rows: 0
- Columns: 9

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | collection_id | uuid | NO |  |
| 3 | name | text | NO |  |
| 4 | description | text | YES |  |
| 5 | category | text | YES |  |
| 6 | style_tags | ARRAY | YES | '{}'::text[] |
| 7 | image_urls | ARRAY | YES | '{}'::text[] |
| 8 | is_available | boolean | YES | true |
| 9 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### collections

- Rows: 0
- Columns: 6

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | text | NO |  |
| 3 | description | text | YES |  |
| 4 | season | text | YES |  |
| 5 | is_active | boolean | YES | true |
| 6 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### inventory

- Rows: 0
- Columns: 9

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | text | NO |  |
| 3 | category | text | YES |  |
| 4 | description | text | YES |  |
| 5 | quantity | numeric | NO | 0 |
| 6 | unit | text | YES | 'meters'::text |
| 7 | low_stock_threshold | numeric | YES | 5 |
| 8 | created_at | timestamp with time zone | NO | now() |
| 9 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### inventory_issuances

- Rows: 0
- Columns: 12

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | inventory_id | uuid | NO |  |
| 3 | job_id | uuid | YES |  |
| 4 | order_id | uuid | YES |  |
| 5 | client_tag | text | YES |  |
| 6 | quantity_issued | numeric | NO |  |
| 7 | issued_by_id | uuid | NO |  |
| 8 | acknowledged_at | timestamp with time zone | YES |  |
| 9 | acknowledged_by_id | uuid | YES |  |
| 10 | returned_quantity | numeric | YES | 0 |
| 11 | notes | text | YES |  |
| 12 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### jobs

- Rows: 0
- Columns: 24

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | job_number | text | NO |  |
| 3 | order_id | uuid | NO |  |
| 4 | order_item_id | uuid | YES |  |
| 5 | tailor_id | uuid | YES |  |
| 6 | status | text | NO | 'unassigned'::text |
| 7 | assigned_at | timestamp with time zone | YES |  |
| 8 | assigned_by_id | uuid | YES |  |
| 9 | due_date | timestamp with time zone | YES |  |
| 10 | materials_received_at | timestamp with time zone | YES |  |
| 11 | started_at | timestamp with time zone | YES |  |
| 12 | completed_at | timestamp with time zone | YES |  |
| 13 | proof_photo_url | text | YES |  |
| 14 | tailor_notes | text | YES |  |
| 15 | qc_status | text | YES |  |
| 16 | qc_reviewed_at | timestamp with time zone | YES |  |
| 17 | qc_reviewed_by_id | uuid | YES |  |
| 18 | qc_notes | text | YES |  |
| 19 | previous_tailor_id | uuid | YES |  |
| 20 | reassignment_reason | text | YES |  |
| 21 | commission_amount | numeric | YES | 0 |
| 22 | commission_paid | boolean | YES | false |
| 23 | created_at | timestamp with time zone | NO | now() |
| 24 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### measurements

- Rows: 0
- Columns: 22

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | order_id | uuid | YES |  |
| 4 | captured_by | text | NO |  |
| 5 | captured_by_id | uuid | YES |  |
| 6 | neck | numeric | YES |  |
| 7 | chest | numeric | YES |  |
| 8 | waist | numeric | YES |  |
| 9 | hips | numeric | YES |  |
| 10 | shoulder_width | numeric | YES |  |
| 11 | sleeve_length | numeric | YES |  |
| 12 | inseam | numeric | YES |  |
| 13 | thigh | numeric | YES |  |
| 14 | calf | numeric | YES |  |
| 15 | wrist | numeric | YES |  |
| 16 | back_length | numeric | YES |  |
| 17 | weight | numeric | YES |  |
| 18 | notes | text | YES |  |
| 19 | pending_for_next_cycle | boolean | YES | false |
| 20 | is_active | boolean | YES | false |
| 21 | created_at | timestamp with time zone | NO | now() |
| 22 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### notifications

- Rows: 0
- Columns: 10

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | YES |  |
| 3 | tailor_id | uuid | YES |  |
| 4 | admin_id | uuid | YES |  |
| 5 | title | text | NO |  |
| 6 | body | text | NO |  |
| 7 | type | text | NO |  |
| 8 | is_read | boolean | YES | false |
| 9 | data | jsonb | YES | '{}'::jsonb |
| 10 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### order_items

- Rows: 0
- Columns: 11

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | order_id | uuid | NO |  |
| 3 | collection_item_id | uuid | YES |  |
| 4 | style_name | text | NO |  |
| 5 | description | text | YES |  |
| 6 | fabric | text | YES |  |
| 7 | color | text | YES |  |
| 8 | quantity | integer | YES | 1 |
| 9 | customizations | jsonb | YES | '{}'::jsonb |
| 10 | status | text | YES | 'pending'::text |
| 11 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### order_status_history

- Rows: 0
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | order_id | uuid | NO |  |
| 3 | from_status | text | YES |  |
| 4 | to_status | text | NO |  |
| 5 | changed_by_id | uuid | NO |  |
| 6 | changed_by_role | text | NO |  |
| 7 | notes | text | YES |  |
| 8 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### orders

- Rows: 0
- Columns: 30

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | order_number | text | NO |  |
| 3 | client_tag | text | NO |  |
| 4 | user_id | uuid | NO |  |
| 5 | subscription_id | uuid | YES |  |
| 6 | styling_window_id | uuid | YES |  |
| 7 | order_type | text | NO | 'subscription'::text |
| 8 | status | text | NO | 'styling_in_progress'::text |
| 9 | styling_window_open | boolean | YES | true |
| 10 | styling_window_locked_at | timestamp with time zone | YES |  |
| 11 | production_started_at | timestamp with time zone | YES |  |
| 12 | production_started_by | uuid | YES |  |
| 13 | estimated_delivery_date | timestamp with time zone | YES |  |
| 14 | delivery_method | text | YES | 'standard'::text |
| 15 | tracking_number | text | YES |  |
| 16 | dispatched_at | timestamp with time zone | YES |  |
| 17 | delivered_at | timestamp with time zone | YES |  |
| 18 | delivered_by | uuid | YES |  |
| 19 | delivery_proof_url | text | YES |  |
| 20 | total_amount | numeric | YES | 0 |
| 21 | amount_paid | numeric | YES | 0 |
| 22 | outstanding_balance | numeric | YES | 0 |
| 23 | payment_status | text | YES | 'pending'::text |
| 24 | cancelled_at | timestamp with time zone | YES |  |
| 25 | cancellation_reason | text | YES |  |
| 26 | cancelled_by | uuid | YES |  |
| 27 | notes | text | YES |  |
| 28 | internal_notes | text | YES |  |
| 29 | created_at | timestamp with time zone | NO | now() |
| 30 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### payment_attempts

- Rows: 0
- Columns: 7

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | payment_id | uuid | NO |  |
| 3 | attempt_number | integer | NO |  |
| 4 | method_type | text | YES |  |
| 5 | status | text | NO |  |
| 6 | failure_reason | text | YES |  |
| 7 | attempted_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### payments

- Rows: 3
- Columns: 25

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | subscription_id | uuid | YES |  |
| 4 | order_id | uuid | YES |  |
| 5 | special_request_id | uuid | YES |  |
| 6 | amount | numeric | NO |  |
| 7 | currency | text | YES | 'NGN'::text |
| 8 | type | text | NO | 'subscription'::text |
| 9 | status | text | NO | 'pending'::text |
| 10 | paystack_reference | text | YES |  |
| 11 | paystack_data | jsonb | YES | '{}'::jsonb |
| 12 | payment_method_id | uuid | YES |  |
| 13 | failure_reason | text | YES |  |
| 14 | retry_count | integer | YES | 0 |
| 15 | next_retry_at | timestamp with time zone | YES |  |
| 16 | created_at | timestamp with time zone | NO | now() |
| 17 | updated_at | timestamp with time zone | NO | now() |
| 18 | transaction_reference | text | YES |  |
| 19 | payment_type | text | YES |  |
| 20 | provider_reference | text | YES |  |
| 21 | provider_response | jsonb | YES |  |
| 22 | metadata | jsonb | YES |  |
| 23 | refund | jsonb | YES |  |
| 24 | paid_at | timestamp with time zone | YES |  |
| 25 | failed_at | timestamp with time zone | YES |  |

#### Data

| # | id | user_id | subscription_id | order_id | special_request_id | amount | currency | type | status | paystack_reference | paystack_data | payment_method_id | failure_reason | retry_count | next_retry_at | created_at | updated_at | transaction_reference | payment_type | provider_reference | provider_response | metadata | refund | paid_at | failed_at |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ca853938-3e9c-4a62-9d8c-7031da5d23b9 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | 077116c6-6aa6-4cb4-b3a0-66415ec4f9b4 | NULL | NULL | 3500000 | NGN | subscription | pending | NULL | {} | NULL | NULL | 0 | NULL | 2026-02-28T15:25:55.751Z | 2026-02-28T15:25:56.340Z | VCP-1772292355714-49F079DAC672 | subscription | VCP-1772292355714-B6686555F28B | NULL | {"email":"rukkiecodes@gmail.com","planId":"ee4b39b4-0f76-4a1e-816e-9dabcf352a7a","userId":"257031ff-8bd0-40e3-be6c-c7c4cf5d5a67","subscriptionId":"077116c6-6aa6-4cb4-b3a0-66415ec4f9b4"} | NULL | NULL | NULL |
| 2 | 692d257b-030a-40f2-99a3-d6782a7c899c | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | 7f0ed362-c112-4615-9e53-6330da8e2ea3 | NULL | NULL | 3500000 | NGN | subscription | pending | NULL | {} | NULL | NULL | 0 | NULL | 2026-02-28T16:35:46.126Z | 2026-02-28T16:35:46.687Z | VCP-1772296546090-0D7F2C62E175 | subscription | VCP-1772296546090-669A910F857D | NULL | {"email":"rukkiecodes@gmail.com","planId":"ee4b39b4-0f76-4a1e-816e-9dabcf352a7a","userId":"257031ff-8bd0-40e3-be6c-c7c4cf5d5a67","subscriptionId":"7f0ed362-c112-4615-9e53-6330da8e2ea3"} | NULL | NULL | NULL |
| 3 | 169eba93-a267-400a-a08f-6bbc103b455c | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | c33a8633-a78e-4251-b693-3d9d0be26729 | NULL | NULL | 3500000 | NGN | subscription | pending | NULL | {} | NULL | NULL | 0 | NULL | 2026-02-28T16:57:04.076Z | 2026-02-28T16:57:04.580Z | VCP-1772297824039-3A6916F59170 | subscription | VCP-1772297824039-FA43CED78EAE | NULL | {"email":"rukkiecodes@gmail.com","planId":"ee4b39b4-0f76-4a1e-816e-9dabcf352a7a","userId":"257031ff-8bd0-40e3-be6c-c7c4cf5d5a67","subscriptionId":"c33a8633-a78e-4251-b693-3d9d0be26729"} | NULL | NULL | NULL |

### payout_jobs

- Rows: 0
- Columns: 4

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | payout_id | uuid | NO |  |
| 3 | job_id | uuid | NO |  |
| 4 | amount | numeric | NO |  |

#### Data

_No rows found._

### payouts

- Rows: 0
- Columns: 14

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | payout_number | text | NO |  |
| 3 | tailor_id | uuid | NO |  |
| 4 | period_start | timestamp with time zone | NO |  |
| 5 | period_end | timestamp with time zone | NO |  |
| 6 | total_amount | numeric | NO | 0 |
| 7 | job_count | integer | YES | 0 |
| 8 | status | text | NO | 'pending'::text |
| 9 | bank_name | text | YES |  |
| 10 | account_number | text | YES |  |
| 11 | account_name | text | YES |  |
| 12 | paid_at | timestamp with time zone | YES |  |
| 13 | notes | text | YES |  |
| 14 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### qc_reviews

- Rows: 0
- Columns: 7

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | job_id | uuid | NO |  |
| 3 | reviewed_by_id | uuid | NO |  |
| 4 | decision | text | NO |  |
| 5 | notes | text | YES |  |
| 6 | rejection_reason | text | YES |  |
| 7 | reviewed_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### ratings

- Rows: 0
- Columns: 7

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | job_id | uuid | NO |  |
| 3 | tailor_id | uuid | NO |  |
| 4 | rated_by_id | uuid | NO |  |
| 5 | score | integer | NO |  |
| 6 | notes | text | YES |  |
| 7 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### referral_invites

- Rows: 0
- Columns: 13

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | inviter_user_id | uuid | NO |  |
| 3 | invited_user_id | uuid | YES |  |
| 4 | invited_email | text | YES |  |
| 5 | invite_code | character varying | NO |  |
| 6 | status | text | NO | 'pending'::text |
| 7 | reward_amount | numeric | NO | 0 |
| 8 | reward_currency | character varying | NO | 'NGN'::character varying |
| 9 | accepted_at | timestamp with time zone | YES |  |
| 10 | rewarded_at | timestamp with time zone | YES |  |
| 11 | subscription_id | uuid | YES |  |
| 12 | created_at | timestamp with time zone | NO | now() |
| 13 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### schema_migrations

- Rows: 11
- Columns: 2

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | filename | text | NO |  |
| 2 | applied_at | timestamp with time zone | NO | now() |

#### Data

| # | filename | applied_at |
|---:|---|---|
| 1 | 001_initial_schema.sql | 2026-03-12T15:15:25.874Z |
| 2 | 002_styles_table.sql | 2026-03-12T15:15:26.305Z |
| 3 | 003_subscription_plans_schema_update.sql | 2026-03-12T15:15:27.480Z |
| 4 | 005_user_subscriptions_billing.sql | 2026-03-12T15:15:28.537Z |
| 5 | 006_users_paystack_customer.sql | 2026-03-12T15:15:29.552Z |
| 6 | 007_user_subscriptions_full.sql | 2026-03-12T15:15:30.687Z |
| 7 | 008_user_subscriptions_constraints.sql | 2026-03-12T15:15:31.712Z |
| 8 | 009_payments_full.sql | 2026-03-12T15:15:32.701Z |
| 9 | 010_vicelle_pay_full.sql | 2026-03-12T15:15:33.668Z |
| 10 | 011_paypal_columns.sql | 2026-03-12T15:15:34.683Z |
| 11 | 012_referrals.sql | 2026-03-12T15:15:35.751Z |

### search_cache

- Rows: 0
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('search_cache_id_seq'::regclass) |
| 2 | cache_key | text | NO |  |
| 3 | query | text | NO |  |
| 4 | level | smallint | NO | 1 |
| 5 | results | jsonb | NO | '[]'::jsonb |
| 6 | expires_at | bigint | YES |  |
| 7 | created_at | timestamp with time zone | NO | now() |
| 8 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### search_history

- Rows: 0
- Columns: 7

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('search_history_id_seq'::regclass) |
| 2 | query | text | NO |  |
| 3 | user_id | uuid | YES |  |
| 4 | level_reached | smallint | NO | 1 |
| 5 | result_count | integer | NO | 0 |
| 6 | took_ms | integer | YES |  |
| 7 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### special_requests

- Rows: 0
- Columns: 20

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | request_number | text | NO |  |
| 3 | user_id | uuid | NO |  |
| 4 | collection_item_id | uuid | YES |  |
| 5 | inspiration_images | ARRAY | YES | '{}'::text[] |
| 6 | inspiration_link | text | YES |  |
| 7 | event_occasion | text | YES |  |
| 8 | urgency | text | NO | 'standard'::text |
| 9 | description | text | YES |  |
| 10 | status | text | NO | 'pending'::text |
| 11 | material_cost | numeric | YES | 0 |
| 12 | urgency_surcharge | numeric | YES | 0 |
| 13 | delivery_fee | numeric | YES | 0 |
| 14 | service_fee | numeric | YES | 0 |
| 15 | total_quote | numeric | YES | 0 |
| 16 | deposit_amount | numeric | YES | 0 |
| 17 | deposit_paid_at | timestamp with time zone | YES |  |
| 18 | admin_notes | text | YES |  |
| 19 | created_at | timestamp with time zone | NO | now() |
| 20 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### styles

- Rows: 0
- Columns: 15

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | text | NO |  |
| 3 | slug | text | NO |  |
| 4 | description | text | YES |  |
| 5 | category | text | YES |  |
| 6 | images | jsonb | NO | '[]'::jsonb |
| 7 | tags | ARRAY | NO | '{}'::text[] |
| 8 | keywords | ARRAY | NO | '{}'::text[] |
| 9 | source | text | NO | 'manual'::text |
| 10 | search_query | text | YES |  |
| 11 | search_results | jsonb | YES |  |
| 12 | is_active | boolean | NO | true |
| 13 | created_by | uuid | YES |  |
| 14 | created_at | timestamp with time zone | NO | now() |
| 15 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### styling_windows

- Rows: 0
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | subscription_id | uuid | NO |  |
| 3 | opens_at | timestamp with time zone | NO |  |
| 4 | closes_at | timestamp with time zone | NO |  |
| 5 | is_locked | boolean | YES | false |
| 6 | locked_at | timestamp with time zone | YES |  |
| 7 | locked_by_id | uuid | YES |  |
| 8 | created_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### subscription_plans

- Rows: 8
- Columns: 15

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | text | NO |  |
| 3 | description | text | YES |  |
| 4 | price | numeric | NO | 0 |
| 5 | billing_cycle | text | NO | 'monthly'::text |
| 6 | max_garments_per_cycle | integer | YES | 0 |
| 7 | includes_measurement_service | boolean | YES | false |
| 8 | features | jsonb | YES | '[]'::jsonb |
| 9 | is_active | boolean | YES | true |
| 10 | created_at | timestamp with time zone | NO | now() |
| 11 | updated_at | timestamp with time zone | NO | now() |
| 12 | slug | text | YES |  |
| 13 | pricing | jsonb | YES |  |
| 14 | styling_window | jsonb | YES | '{"reminderDays": [7, 3, 1], "daysBeforeProduction": 7}'::jsonb |
| 15 | display_order | integer | NO | 0 |

#### Data

| # | id | name | description | price | billing_cycle | max_garments_per_cycle | includes_measurement_service | features | is_active | created_at | updated_at | slug | pricing | styling_window | display_order |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | The Starter Package | Bronze Membership — 1 fitting for all styles, 2 fittings for casual styles. | 0 | monthly | 0 | false | {"fabricOptions":["Simple & modest styles for Men and Women","Good material quality, custom fitted","1 fitting (2 fittings for casual styles)","Free Birthday Outfit after 8 months","Delivery 2 weeks after full payment"],"itemsPerCycle":1,"freeAlterations":true,"prioritySupport":false,"accessoryDiscount":0,"styleConsultation":false} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | starter-package | {"amount":35000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 1 |
| 2 | dcd24f42-5954-4eed-89ce-1cc1bd7c7d89 | The Exclusive Starter | Bronze Membership — 3 exclusive fittings per cycle. | 0 | monthly | 0 | false | {"fabricOptions":["Exclusive styles for Men and Women","Higher-quality materials, custom fitted","3 exclusive fittings","Access to exclusive & streetwear collections","Free Birthday Outfit after 8 months","Flexible 1-month payment plan available"],"itemsPerCycle":3,"freeAlterations":true,"prioritySupport":false,"accessoryDiscount":0,"styleConsultation":false} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | exclusive-starter | {"amount":70000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 2 |
| 3 | 9467cc42-e7e8-4ba3-b305-c0ce29c35203 | Elevated Style | Silver Membership — 4 exclusive fittings, access to 3 collections. | 0 | monthly | 0 | false | {"fabricOptions":["Exclusive styles for Men and Women","Access to 3 exclusive collections","4 exclusive fittings, custom fitted","Free Birthday Outfit after 6 months","Flexible 1–2 month payment plan"],"itemsPerCycle":4,"freeAlterations":true,"prioritySupport":false,"accessoryDiscount":5,"styleConsultation":true} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | elevated-style | {"amount":120000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 3 |
| 4 | 97da8c62-4438-45dc-a2e7-5cce886262ee | Luxe Wardrobe Refresh | Silver Membership — 6 exclusive fittings, priority consultation, premium packaging. | 0 | monthly | 0 | false | {"fabricOptions":["Exclusive styles for Men and Women","Access to 4 exclusive collections","6 exclusive fittings, custom-tailored fit","Priority styling consultation","Delivered in premium packaging","Free Birthday Outfit after 6 months","Optional styling tips included"],"itemsPerCycle":6,"freeAlterations":true,"prioritySupport":true,"accessoryDiscount":10,"styleConsultation":true} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | luxe-wardrobe-refresh | {"amount":200000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 4 |
| 5 | 83803f26-4527-4c64-afd2-5759ac331e10 | STYLE-U Prestige Wardrobe | Gold Membership — 10 exclusive fittings, personalized or Vicelle-designed wardrobe. | 0 | monthly | 0 | false | {"fabricOptions":["Personalized style or full Vicelle-designed wardrobe","Access to select exclusive collections","10 exclusive fittings","Delivered in luxury packaging","Flexible payment options","Free Birthday Masterpiece after 4 months","Styling guidance for mix-and-match outfits"],"itemsPerCycle":10,"freeAlterations":true,"prioritySupport":true,"accessoryDiscount":15,"styleConsultation":true} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | styleu-prestige | {"amount":400000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 5 |
| 6 | 3a7e9327-5e4e-444c-a71d-656b4c3737f3 | STYLE-U Executive Wardrobe | Gold Membership — 17 exclusive fittings, luxury packaging, flexible payments. | 0 | monthly | 0 | false | {"fabricOptions":["Personalized style or full Vicelle-designed wardrobe","Access to select exclusive collections","17 exclusive fittings","Delivered in luxury packaging","Flexible payment options","Free Birthday Masterpiece after 4 months","Styling guidance for mix-and-match outfits"],"itemsPerCycle":17,"freeAlterations":true,"prioritySupport":true,"accessoryDiscount":20,"styleConsultation":true} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | styleu-executive | {"amount":850000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 6 |
| 7 | b3fff1ce-9d67-421e-b4c1-e7fbf46fc321 | STYLE-U Elite Wardrobe | Gold Membership — Complete custom exclusive wardrobe with personal styling session. | 0 | monthly | 0 | false | {"fabricOptions":["Personal styling session to design your unique collection","Access to all exclusive collections","Bi-monthly measurement updates for perfect fit","Premium packaging with styling guide","Limited-edition pieces exclusive to you","Free Birthday Masterpiece after 4 months","Flexible payment plans available"],"itemsPerCycle":0,"freeAlterations":true,"prioritySupport":true,"accessoryDiscount":25,"styleConsultation":true} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | styleu-elite | {"amount":1500000,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 7 |
| 8 | 4a797fba-e1a4-4aaa-a993-9d354d05e2fb | Custom Package | Gold Membership — Fully personalized collection. Price determined by customization. | 0 | monthly | 0 | false | {"fabricOptions":["Fully personalized pieces exclusive to you","Option to monetize your collection","Access to premium fabrics & limited materials","Limited-edition pieces unavailable elsewhere","Styling consultation calls or digital guides","Priority delivery","Free Birthday Masterpiece after 4 months","Collection grows over time"],"itemsPerCycle":0,"freeAlterations":true,"prioritySupport":true,"accessoryDiscount":25,"styleConsultation":true} | true | 2026-02-24T09:54:44.113Z | 2026-02-24T09:54:44.113Z | custom-package | {"amount":0,"currency":"NGN","billingCycle":"monthly"} | {"reminderDays":[7,3,1],"daysBeforeProduction":7} | 8 |

### tailors

- Rows: 0
- Columns: 36

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | full_name | text | NO |  |
| 3 | email | text | NO |  |
| 4 | password_hash | text | NO |  |
| 5 | phone | text | YES |  |
| 6 | status | text | NO | 'pending'::text |
| 7 | specialties | ARRAY | YES | '{}'::text[] |
| 8 | preferred_payment_method | text | YES |  |
| 9 | bank_name | text | YES |  |
| 10 | account_number | text | YES |  |
| 11 | account_name | text | YES |  |
| 12 | kyc_docs | ARRAY | YES | '{}'::text[] |
| 13 | profile_photo_url | text | YES |  |
| 14 | capacity_per_day | integer | YES | 2 |
| 15 | capacity_per_week | integer | YES | 10 |
| 16 | capacity_per_month | integer | YES | 40 |
| 17 | is_capacity_reduced | boolean | YES | false |
| 18 | capacity_reduced_until | timestamp with time zone | YES |  |
| 19 | capacity_reduction_reason | text | YES |  |
| 20 | total_jobs_completed | integer | YES | 0 |
| 21 | total_jobs_assigned | integer | YES | 0 |
| 22 | missed_deadlines | integer | YES | 0 |
| 23 | consecutive_miss_count | integer | YES | 0 |
| 24 | consecutive_on_time_count | integer | YES | 0 |
| 25 | on_time_delivery_rate | numeric | YES | 100 |
| 26 | average_rating | numeric | YES | 0 |
| 27 | is_on_probation | boolean | YES | true |
| 28 | probation_jobs_completed | integer | YES | 0 |
| 29 | advance_eligible | boolean | YES | false |
| 30 | last_login_at | timestamp with time zone | YES |  |
| 31 | reset_token | text | YES |  |
| 32 | reset_token_expires_at | timestamp with time zone | YES |  |
| 33 | is_deleted | boolean | NO | false |
| 34 | deleted_at | timestamp with time zone | YES |  |
| 35 | created_at | timestamp with time zone | NO | now() |
| 36 | updated_at | timestamp with time zone | NO | now() |

#### Data

_No rows found._

### user_delivery_details

- Rows: 1
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | address | text | YES |  |
| 4 | phone | text | YES |  |
| 5 | landmark | text | YES |  |
| 6 | nearest_bus_stop | text | YES |  |
| 7 | created_at | timestamp with time zone | NO | now() |
| 8 | updated_at | timestamp with time zone | NO | now() |

#### Data

| # | id | user_id | address | phone | landmark | nearest_bus_stop | created_at | updated_at |
|---:|---|---|---|---|---|---|---|---|
| 1 | 597ccf32-cf24-4466-b5ef-fb7fd6905423 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | 20 Wilcox drive, Mgboba | +2349166422808 | Salvation ministry | NTA TV Station | 2026-02-23T16:03:36.780Z | 2026-02-24T06:57:22.202Z |

### user_payment_methods

- Rows: 0
- Columns: 18

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | type | text | NO |  |
| 4 | card_last4 | text | YES |  |
| 5 | card_brand | text | YES |  |
| 6 | paystack_authorization_code | text | YES |  |
| 7 | bank_name | text | YES |  |
| 8 | account_number | text | YES |  |
| 9 | account_name | text | YES |  |
| 10 | is_default | boolean | YES | false |
| 11 | created_at | timestamp with time zone | NO | now() |
| 12 | authorization_status | text | NO | 'pending'::text |
| 13 | bank_code | text | YES |  |
| 14 | paystack_customer_code | text | YES |  |
| 15 | mandate_reference | text | YES |  |
| 16 | updated_at | timestamp with time zone | NO | now() |
| 17 | paypal_payment_token | text | YES |  |
| 18 | paypal_customer_id | text | YES |  |

#### Data

_No rows found._

### user_preferences

- Rows: 1
- Columns: 8

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | clothing_styles | ARRAY | YES | '{}'::text[] |
| 4 | colors | ARRAY | YES | '{}'::text[] |
| 5 | fabrics | ARRAY | YES | '{}'::text[] |
| 6 | lifestyle | jsonb | YES | '{}'::jsonb |
| 7 | created_at | timestamp with time zone | NO | now() |
| 8 | updated_at | timestamp with time zone | NO | now() |

#### Data

| # | id | user_id | clothing_styles | colors | fabrics | lifestyle | created_at | updated_at |
|---:|---|---|---|---|---|---|---|---|
| 1 | 7217694a-3be6-44d8-b2e4-36702ca91946 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ["Casual","Formal","Business","Vintage"] | ["Black","White","Navy","Grey","Brown","Red","Blue","Green","Yellow","Pink","Purple"] | ["Cotton","Linen","Silk"] | {} | 2026-02-23T15:12:44.782Z | 2026-02-23T15:47:15.161Z |

### user_subscriptions

- Rows: 16
- Columns: 21

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | plan_id | uuid | NO |  |
| 4 | status | text | NO | 'active'::text |
| 5 | billing_type | text | NO | 'recurring'::text |
| 6 | current_cycle_start | timestamp with time zone | YES |  |
| 7 | current_cycle_end | timestamp with time zone | YES |  |
| 8 | next_billing_date | timestamp with time zone | YES |  |
| 9 | total_paid | numeric | YES | 0 |
| 10 | outstanding_balance | numeric | YES | 0 |
| 11 | payment_failure_count | integer | YES | 0 |
| 12 | created_at | timestamp with time zone | NO | now() |
| 13 | updated_at | timestamp with time zone | NO | now() |
| 14 | billing | jsonb | YES |  |
| 15 | current_cycle | jsonb | YES |  |
| 16 | payment_status | character varying | YES | 'pending'::character varying |
| 17 | grace_period_ends | timestamp with time zone | YES |  |
| 18 | start_date | timestamp with time zone | YES | now() |
| 19 | end_date | timestamp with time zone | YES |  |
| 20 | renewal_enabled | boolean | YES | true |
| 21 | cancellation | jsonb | YES |  |

#### Data

| # | id | user_id | plan_id | status | billing_type | current_cycle_start | current_cycle_end | next_billing_date | total_paid | outstanding_balance | payment_failure_count | created_at | updated_at | billing | current_cycle | payment_status | grace_period_ends | start_date | end_date | renewal_enabled | cancellation |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | a89886fb-8679-4a98-8d40-06aca8844aa8 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T14:37:25.899Z | 2026-02-28T14:37:33.093Z | NULL | NULL | pending | NULL | 2026-02-28T14:37:25.863Z | NULL | true | NULL |
| 2 | 587fb4be-d0b0-47f7-9a3c-71c37463e3ee | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T14:37:33.163Z | 2026-02-28T14:37:45.687Z | NULL | NULL | pending | NULL | 2026-02-28T14:37:33.128Z | NULL | true | NULL |
| 3 | 4e574790-ebf4-4114-8183-e7339dc987a0 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T14:37:45.757Z | 2026-02-28T14:48:51.863Z | NULL | NULL | pending | NULL | 2026-02-28T14:37:45.721Z | NULL | true | NULL |
| 4 | 4be9c2fb-583f-4970-a8ff-994d02ed0d76 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T14:48:51.941Z | 2026-02-28T14:51:18.907Z | NULL | NULL | pending | NULL | 2026-02-28T14:48:51.904Z | NULL | true | NULL |
| 5 | 22dfe319-c389-4e26-94b6-02d164cd3efb | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T14:51:18.978Z | 2026-02-28T15:07:19.830Z | NULL | NULL | pending | NULL | 2026-02-28T14:51:18.942Z | NULL | true | NULL |
| 6 | 987b03ce-ea45-470c-b664-bfd2464533d3 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T15:07:19.939Z | 2026-02-28T15:17:02.508Z | NULL | NULL | pending | NULL | 2026-02-28T15:07:19.902Z | NULL | true | NULL |
| 7 | dcc348b3-8c34-400f-83ec-0cca9af78d47 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T15:17:02.591Z | 2026-02-28T15:18:10.625Z | NULL | NULL | pending | NULL | 2026-02-28T15:17:02.554Z | NULL | true | NULL |
| 8 | c8e32566-4989-49e2-ab26-1bc082598180 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T15:18:10.697Z | 2026-02-28T15:25:53.903Z | NULL | NULL | pending | NULL | 2026-02-28T15:18:10.662Z | NULL | true | NULL |
| 9 | 077116c6-6aa6-4cb4-b3a0-66415ec4f9b4 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T15:25:53.999Z | 2026-02-28T16:35:44.340Z | NULL | NULL | pending | NULL | 2026-02-28T15:25:53.963Z | NULL | true | NULL |
| 10 | 7f0ed362-c112-4615-9e53-6330da8e2ea3 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T16:35:44.422Z | 2026-02-28T16:57:02.272Z | NULL | NULL | pending | NULL | 2026-02-28T16:35:44.387Z | NULL | true | NULL |
| 11 | c33a8633-a78e-4251-b693-3d9d0be26729 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T16:57:02.367Z | 2026-02-28T23:45:23.962Z | NULL | NULL | pending | NULL | 2026-02-28T16:57:02.330Z | NULL | true | NULL |
| 12 | a12f11b1-ed3c-4865-8980-098660a59a91 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-02-28T23:45:24.071Z | 2026-03-01T04:40:37.786Z | NULL | NULL | pending | NULL | 2026-02-28T23:45:24.035Z | NULL | true | NULL |
| 13 | 154793a0-d50e-4325-8a3f-7eee054c72b0 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-03-01T04:40:37.873Z | 2026-03-01T04:55:24.004Z | NULL | NULL | pending | NULL | 2026-03-01T04:40:37.838Z | NULL | true | NULL |
| 14 | f80c7985-0476-4630-b161-057e42979ddb | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-03-01T04:55:24.094Z | 2026-03-01T04:57:05.776Z | NULL | NULL | pending | NULL | 2026-03-01T04:55:24.059Z | NULL | true | NULL |
| 15 | e262561f-4e38-4df8-a7a0-8d04a10ff486 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | cancelled | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-03-01T04:57:05.849Z | 2026-03-01T04:59:25.358Z | NULL | NULL | pending | NULL | 2026-03-01T04:57:05.814Z | NULL | true | NULL |
| 16 | 14bda357-9a80-4246-b52f-21ef44f1e96b | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | ee4b39b4-0f76-4a1e-816e-9dabcf352a7a | pending_payment | recurring | NULL | NULL | NULL | 0 | 0 | 0 | 2026-03-01T04:59:25.431Z | 2026-03-01T04:59:25.431Z | NULL | NULL | pending | NULL | 2026-03-01T04:59:25.396Z | NULL | true | NULL |

### users

- Rows: 4
- Columns: 26

#### Columns

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | full_name | text | NO |  |
| 3 | email | text | NO |  |
| 4 | phone | text | YES |  |
| 5 | activation_code | text | YES |  |
| 6 | is_activated | boolean | NO | false |
| 7 | activated_at | timestamp with time zone | YES |  |
| 8 | status | text | NO | 'inactive'::text |
| 9 | is_onboarded | boolean | NO | false |
| 10 | onboarding_step | integer | YES | 0 |
| 11 | date_of_birth | date | YES |  |
| 12 | height | numeric | YES |  |
| 13 | height_source | text | YES |  |
| 14 | gender | text | YES |  |
| 15 | profile_photo_url | text | YES |  |
| 16 | birthday_package_eligible | boolean | YES | false |
| 17 | last_login_at | timestamp with time zone | YES |  |
| 18 | failed_login_attempts | integer | YES | 0 |
| 19 | created_by_admin_id | uuid | YES |  |
| 20 | is_deleted | boolean | NO | false |
| 21 | deleted_at | timestamp with time zone | YES |  |
| 22 | created_at | timestamp with time zone | NO | now() |
| 23 | updated_at | timestamp with time zone | NO | now() |
| 24 | paystack_customer_code | character varying | YES |  |
| 25 | referral_balance | numeric | NO | 0 |
| 26 | referral_total_earned | numeric | NO | 0 |

#### Data

| # | id | full_name | email | phone | activation_code | is_activated | activated_at | status | is_onboarded | onboarding_step | date_of_birth | height | height_source | gender | profile_photo_url | birthday_package_eligible | last_login_at | failed_login_attempts | created_by_admin_id | is_deleted | deleted_at | created_at | updated_at | paystack_customer_code | referral_balance | referral_total_earned |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 32cf00c3-bb2b-4251-ae9d-77e94bb6a3b1 | Terry Amagboro | rukkiecodes2@gmail.com | +2349166422808 | 711178 | true | NULL | active | false | 0 | NULL | NULL | NULL | NULL | NULL | false | NULL | 0 | 00000000-0000-0000-0000-000000000000 | false | NULL | 2026-02-20T19:20:58.743Z | 2026-03-07T23:07:27.046Z | NULL | 0 | 0 |
| 2 | 087e61fa-4424-409c-a6e4-cc1ebddf785c | Terry Amagboro | terryfrank555@gmail.com | +2349166422808 | 344783 | true | NULL | active | false | 0 | NULL | NULL | NULL | NULL | NULL | false | NULL | 0 | 00000000-0000-0000-0000-000000000000 | false | NULL | 2026-02-20T19:22:21.795Z | 2026-03-07T23:07:50.775Z | NULL | 0 | 0 |
| 3 | 78655b72-0fd0-4be1-944f-ea99406e5f18 | Collins Chinakwe | getorbitx@gmail.com | 0916642280 | 766997 | true | NULL | active | false | 0 | NULL | NULL | NULL | NULL | NULL | false | NULL | 0 | NULL | false | NULL | 2026-03-08T07:55:44.713Z | 2026-03-08T07:56:35.822Z | NULL | 0 | 0 |
| 4 | 257031ff-8bd0-40e3-be6c-c7c4cf5d5a67 | Terry Amagboro | rukkiecodes@gmail.com | +2349166422808 | 574927 | true | 2026-02-20T19:25:16.732Z | active | true | 4 | 1997-11-06T23:00:00.000Z | 6.2 | NULL | Male | https://res.cloudinary.com/rukkiecodes/image/upload/v1771919974/vicelle/profiles/user_257031ff-8bd0-40e3-be6c-c7c4cf5d5a67.jpg | false | 2026-03-12T18:56:43.867Z | 0 | 00000000-0000-0000-0000-000000000000 | false | NULL | 2026-02-20T19:19:40.237Z | 2026-03-12T18:56:43.901Z | CUS_czyowndgo9w7f3x | 0 | 0 |
