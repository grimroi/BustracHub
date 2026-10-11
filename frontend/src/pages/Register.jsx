import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Self-service resident registration is intentionally disabled.
// Resident accounts must be requested via /resident-register and must be
// approved by barangay staff before credentials are activated (approval
// workflow lives in DashboardPortal). Direct visits to the legacy /register
// route are therefore redirected to the request flow.
export default function Register() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/resident-register', { replace: true });
  }, [navigate]);

  return null;
}