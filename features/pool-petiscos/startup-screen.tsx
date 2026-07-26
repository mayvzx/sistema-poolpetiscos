import Image from "next/image";
import Link from "next/link";

const criticalStyles = `
  @keyframes pool-startup-sweep {
    0% { transform: translateX(-105%); }
    55%, 100% { transform: translateX(305%); }
  }

  @keyframes pool-startup-pulse {
    0%, 100% { opacity: .45; transform: scale(.88); }
    50% { opacity: 1; transform: scale(1); }
  }

  #pool-startup {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    min-height: 100vh;
    place-items: center;
    overflow: auto;
    box-sizing: border-box;
    padding: 24px;
    background:
      radial-gradient(circle at 50% -20%, rgba(220, 38, 38, .12), transparent 38%),
      linear-gradient(145deg, #fbfaf8 0%, #f3efeb 100%);
    color: #24201f;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
  }

  #pool-startup *, #pool-startup *::before, #pool-startup *::after {
    box-sizing: border-box;
  }

  #pool-startup .pool-startup__card {
    width: min(100%, 440px);
    padding: 34px 32px 30px;
    border: 1px solid rgba(54, 42, 37, .09);
    border-radius: 26px;
    background: rgba(255, 255, 255, .94);
    box-shadow: 0 24px 70px rgba(55, 37, 30, .13);
    text-align: center;
  }

  #pool-startup .pool-startup__logo-wrap {
    display: inline-grid;
    place-items: center;
    width: 98px;
    height: 98px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 12px 30px rgba(170, 20, 25, .16);
  }

  #pool-startup .pool-startup__logo {
    display: block;
    width: 88px;
    height: 88px;
    border-radius: 999px;
    object-fit: cover;
  }

  #pool-startup .pool-startup__eyebrow {
    margin: 24px 0 7px;
    color: #c71920;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .16em;
    text-transform: uppercase;
  }

  #pool-startup .pool-startup__title {
    margin: 0;
    color: #201c1b;
    font-size: clamp(25px, 6vw, 32px);
    font-weight: 800;
    letter-spacing: -.035em;
    line-height: 1.12;
  }

  #pool-startup .pool-startup__description {
    max-width: 340px;
    margin: 12px auto 0;
    color: #6d6561;
    font-size: 15px;
    line-height: 1.55;
  }

  #pool-startup .pool-startup__progress {
    position: relative;
    height: 7px;
    margin: 26px 0 17px;
    overflow: hidden;
    border-radius: 999px;
    background: #eee9e5;
  }

  #pool-startup .pool-startup__progress::after {
    position: absolute;
    inset: 0 auto 0 0;
    width: 34%;
    border-radius: inherit;
    background: linear-gradient(90deg, #a91117, #ed2b34);
    content: "";
    animation: pool-startup-sweep 1.75s ease-in-out infinite;
  }

  #pool-startup .pool-startup__status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    margin: 0;
    color: #403936;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.4;
  }

  #pool-startup .pool-startup__dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #dc2626;
    animation: pool-startup-pulse 1.2s ease-in-out infinite;
  }

  #pool-startup .pool-startup__hint {
    margin: 16px auto 0;
    color: #857b76;
    font-size: 12px;
    line-height: 1.5;
  }

  #pool-startup .pool-startup__retry {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    margin-top: 15px;
    padding: 0 18px;
    border: 1px solid #ded6d1;
    border-radius: 12px;
    color: #4b423e;
    font-size: 13px;
    font-weight: 750;
    text-decoration: none;
  }

  #pool-startup .pool-startup__retry:hover {
    border-color: #c71920;
    color: #a91117;
  }

  #pool-startup .pool-startup__noscript {
    margin: 15px 0 0;
    color: #a91117;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.5;
  }

  @media (max-width: 520px) {
    #pool-startup { padding: 16px; }
    #pool-startup .pool-startup__card {
      padding: 29px 22px 25px;
      border-radius: 22px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    #pool-startup .pool-startup__progress::after,
    #pool-startup .pool-startup__dot {
      animation-duration: 4s;
    }
  }
`;

export function StartupScreen() {
  return (
    <>
      <style data-pool-startup-critical>{criticalStyles}</style>
      <main
        id="pool-startup"
        aria-busy="true"
        aria-labelledby="pool-startup-title"
        aria-describedby="pool-startup-description"
      >
        <section className="pool-startup__card">
          <div className="pool-startup__logo-wrap" aria-hidden="true">
            <Image
              src="/pool-logo-round.jpg"
              alt=""
              width={88}
              height={88}
              unoptimized
              priority
              className="pool-startup__logo"
            />
          </div>

          <p className="pool-startup__eyebrow">Pool Petiscos &amp; Lanches</p>
          <h1 id="pool-startup-title" className="pool-startup__title">
            Abrindo o caixa
          </h1>
          <p
            id="pool-startup-description"
            className="pool-startup__description"
          >
            Estamos carregando produtos, vendas e configurações deste
            computador.
          </p>

          <div
            className="pool-startup__progress"
            aria-hidden="true"
            data-testid="startup-progress"
          />
          <p
            className="pool-startup__status"
            role="status"
            aria-live="polite"
          >
            <span className="pool-startup__dot" aria-hidden="true" />
            Conectando os dados deste computador…
          </p>

          <p className="pool-startup__hint">
            Normalmente leva poucos segundos. Na primeira abertura, pode levar
            um pouco mais.
          </p>
          <Link className="pool-startup__retry" href="/">
            Tentar novamente
          </Link>

          <noscript>
            <p className="pool-startup__noscript">
              Ative o JavaScript do navegador para abrir o sistema.
            </p>
          </noscript>
        </section>
      </main>
    </>
  );
}
