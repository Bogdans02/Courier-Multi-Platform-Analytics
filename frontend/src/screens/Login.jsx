import { Link, useLocation, useNavigate } from 'react-router';
import AuthForm from '../components/AuthForm.jsx';
import { login } from '../services/api/auth.js';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(credentials) {
    onLogin(await login(credentials));
    navigate('/dashboard', { replace: true });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Logowanie</h1>
      {location.state?.registered && <p role="status">Konto zostało utworzone. Zaloguj się.</p>}
      <AuthForm mode="login" onSubmit={submit} />
      <p>Nie masz konta? <Link to="/register" className="underline">Zarejestruj się</Link></p>
    </>
  );
}
