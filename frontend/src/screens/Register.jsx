import { Link, useNavigate } from 'react-router';
import AuthForm from '../components/AuthForm.jsx';
import { register } from '../services/api/auth.js';

export default function Register() {
  const navigate = useNavigate();

  async function submit(credentials) {
    await register(credentials);
    navigate('/login', { replace: true, state: { registered: true } });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Rejestracja</h1>
      <AuthForm mode="register" onSubmit={submit} />
      <p>Masz już konto? <Link to="/login" className="underline">Zaloguj się</Link></p>
    </>
  );
}
