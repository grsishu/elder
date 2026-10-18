import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logServerError } from '../errors.js';

const router = express.Router();

async function getElderId(req) {
  if (req.elder?.id) return req.elder.id;
  const res = await query('SELECT id FROM elders WHERE user_id = $1 LIMIT 1', [req.user.user_id]);
  return res.rows[0]?.id || null;
}

// Calculate distance in km
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// POST /api/rides/request - Elder requests ride
router.post('/request', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const {
      vehicleType = 'auto',
      pickupAddress = 'Current Location',
      pickupLat,
      pickupLng,
      destAddress,
      destLat,
      destLng,
      driverId,
    } = req.body;

    if (!destAddress) {
      return res.status(400).json({ error: 'DESTINATION_REQUIRED' });
    }

    // Calculate distance and estimate fare
    let distanceKm = 3.5;
    if (pickupLat && pickupLng && destLat && destLng) {
      distanceKm = Math.max(1, calculateDistanceKm(parseFloat(pickupLat), parseFloat(pickupLng), parseFloat(destLat), parseFloat(destLng)));
    }

    // Fare calculation
    // Auto: base ₹30 + ₹12/km
    // Cab: base ₹50 + ₹18/km
    const baseFare = vehicleType === 'cab' ? 50 : 30;
    const perKm = vehicleType === 'cab' ? 18 : 12;
    const estimatedFare = Math.round(baseFare + distanceKm * perKm);

    // Pick driver if not specified
    let selectedDriver = null;
    if (driverId) {
      const d = await query('SELECT * FROM drivers WHERE id = $1 AND elder_id = $2', [driverId, elderId]);
      selectedDriver = d.rows[0];
    } else {
      const d = await query(
        'SELECT * FROM drivers WHERE elder_id = $1 AND vehicle_type = $2 ORDER BY created_at ASC LIMIT 1',
        [elderId, vehicleType]
      );
      selectedDriver = d.rows[0] || (await query('SELECT * FROM drivers WHERE elder_id = $1 LIMIT 1', [elderId])).rows[0];
    }

    const ins = await query(
      `INSERT INTO rides (
         elder_id, driver_id, vehicle_type, pickup_address, pickup_lat, pickup_lng,
         dest_address, dest_lat, dest_lng, estimated_fare, status, driver_name, eta_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requested', $11, $12)
       RETURNING *`,
      [
        elderId,
        selectedDriver?.id || null,
        vehicleType,
        pickupAddress,
        pickupLat ? parseFloat(pickupLat) : null,
        pickupLng ? parseFloat(pickupLng) : null,
        destAddress,
        destLat ? parseFloat(destLat) : null,
        destLng ? parseFloat(destLng) : null,
        estimatedFare,
        selectedDriver?.name || 'Assigned Driver',
        10,
      ]
    );

    const ride = ins.rows[0];

    // Build prefilled WhatsApp link and phone link if driver exists
    let whatsappLink = null;
    let callLink = null;
    if (selectedDriver?.phone) {
      const cleanPhone = selectedDriver.phone.replace(/[^0-9]/g, '');
      const pickupMap = pickupLat && pickupLng ? `https://maps.google.com/?q=${pickupLat},${pickupLng}` : pickupAddress;
      const destMap = destLat && destLng ? `https://maps.google.com/?q=${destLat},${destLng}` : destAddress;
      const text = encodeURIComponent(
        `Namaskar ${selectedDriver.name}, ride request for elder.\nPickup: ${pickupMap}\nDestination: ${destMap}\nEstimated Fare: ₹${estimatedFare}. Please confirm.`
      );
      whatsappLink = `https://wa.me/${cleanPhone}?text=${text}`;
      callLink = `tel:${selectedDriver.phone}`;
    }

    return res.json({
      success: true,
      ride,
      driver: selectedDriver,
      estimatedFare,
      distanceKm: distanceKm.toFixed(1),
      whatsappLink,
      callLink,
    });
  } catch (err) {
    logServerError({ message: `Ride request error: ${err.message}`, route: '/api/rides/request', statusCode: 500 });
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/rides/:id/approve - Caregiver approves ride
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const up = await query(
      `UPDATE rides SET status = 'approved' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    return res.json({ success: true, ride: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/rides/:id/complete - Elder / driver completes ride & rates
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const { rating } = req.body; // 1, 2, or 3
    const up = await query(
      `UPDATE rides
       SET status = 'completed', rating = $1
       WHERE id = $2 RETURNING *`,
      [rating ? parseInt(rating, 10) : 3, req.params.id]
    );
    return res.json({ success: true, ride: up.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/rides/history - Ride history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const elderId = await getElderId(req);
    if (!elderId) return res.status(404).json({ error: 'NO_ELDER_FOUND' });

    const rides = await query(
      `SELECT r.*, d.name as driver_name, d.phone as driver_phone, d.area as driver_area
       FROM rides r
       LEFT JOIN drivers d ON d.id = r.driver_id
       WHERE r.elder_id = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [elderId]
    );

    const drivers = await query('SELECT * FROM drivers WHERE elder_id = $1', [elderId]);

    return res.json({ success: true, rides: rides.rows, drivers: drivers.rows });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
