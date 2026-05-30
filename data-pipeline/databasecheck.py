import sqlite3
conn = sqlite3.connect('data/output/hyd/hyd_risk_zones.db')
print('Total zones:', conn.execute('SELECT COUNT(*) FROM risk_zones').fetchone()[0])
print('By severity:')
for row in conn.execute('SELECT severity_level, COUNT(*) FROM risk_zones GROUP BY severity_level ORDER BY severity_level'):
    print(f'  Level {row[0]}: {row[1]} zones')
print('By category:')
for row in conn.execute('SELECT risk_category, COUNT(*) FROM risk_zones GROUP BY risk_category'):
    print(f'  {row[0]}: {row[1]} zones')
print('Polygon vertices:', conn.execute('SELECT COUNT(*) FROM polygon_vertices').fetchone()[0])
print('Risk factors:', conn.execute('SELECT COUNT(*) FROM risk_factors').fetchone()[0])
