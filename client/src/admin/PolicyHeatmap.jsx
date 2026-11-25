import { useTranslation } from 'react-i18next';
import { ACTIONS, DAY_TYPES, LOAD_BUCKETS, POLICY } from '../ml/usePolicy';

export default function PolicyHeatmap() {
  const { t } = useTranslation();
  const hasData = DAY_TYPES.some((dayType) =>
    LOAD_BUCKETS.some((bucket) => ACTIONS.includes(POLICY?.[`${dayType}_${bucket}`]?.action)),
  );

  return (
    <section className="card">
      <h2>{t('admin.policy.title')}</h2>
      <p className="policy-lead">{t('admin.policy.lead')}</p>

      {!hasData ? (
        <p className="chart-empty">{t('admin.policy.empty')}</p>
      ) : (
        <>
          <div className="policy-grid" role="table" aria-label={t('admin.policy.title')}>
            <div className="policy-grid__head" role="row">
              <span role="columnheader" aria-hidden="true" />
              {LOAD_BUCKETS.map((bucket) => (
                <span key={bucket} role="columnheader">
                  {t(`admin.policy.load.${bucket}`)}
                </span>
              ))}
            </div>
            {DAY_TYPES.map((dayType) => (
              <div className="policy-grid__row" role="row" key={dayType}>
                <span role="rowheader">{t(`admin.policy.day.${dayType}`)}</span>
                {LOAD_BUCKETS.map((bucket) => {
                  const action = POLICY?.[`${dayType}_${bucket}`]?.action;
                  const valid = ACTIONS.includes(action);
                  return (
                    <span
                      key={bucket}
                      role="cell"
                      className={`policy-cell ${valid ? `policy-cell--${action}` : ''}`}
                    >
                      {valid ? t(`admin.policy.action.${action}`) : '—'}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <ul className="policy-legend" aria-label={t('admin.policy.legend')}>
            {ACTIONS.map((action) => (
              <li key={action}>
                <span className={`policy-dot policy-cell--${action}`} aria-hidden="true" />
                {t(`admin.policy.action.${action}`)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
