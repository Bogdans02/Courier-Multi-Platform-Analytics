import { Link, useLocation, useNavigate } from 'react-router';
import AuthForm from '../components/AuthForm.jsx';
import { login } from '../services/api/auth.js';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(credentials) {
    await onLogin(await login(credentials));
    navigate('/', { replace: true });
  }

  return (
    <>
      <div className="page-heading"><h1>Zaloguj się</h1></div>
      {location.state?.registered && <p role="status">Konto zostało utworzone. Zaloguj się.</p>}
      <AuthForm mode="login" onSubmit={submit} />
      <p>Nie masz konta? <Link to="/register" className="underline">Zarejestruj się</Link></p>
    </>
  );
}
