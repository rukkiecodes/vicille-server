ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address JSONB;

UPDATE orders AS o
SET
  customer_name = COALESCE(o.customer_name, u.full_name),
  customer_email = COALESCE(o.customer_email, u.email),
  customer_phone = COALESCE(o.customer_phone, COALESCE(udd.phone, u.phone)),
  delivery_address = COALESCE(
    o.delivery_address,
    CASE
      WHEN udd.user_id IS NULL THEN NULL
      ELSE jsonb_strip_nulls(
        jsonb_build_object(
          'address', udd.address,
          'phone', COALESCE(udd.phone, u.phone),
          'landmark', udd.landmark,
          'nearestBusStop', udd.nearest_bus_stop
        )
      )
    END
  )
FROM users AS u
LEFT JOIN user_delivery_details AS udd ON udd.user_id = u.id
WHERE o.user_id = u.id;