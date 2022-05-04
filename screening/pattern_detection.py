import talib
import yfinance as yf

data = yf.download('BTC-USD', start='2020-01-01', end='2022-04-24')


morning_stars = talib.CDLMORNINGSTAR(data['Open'], data['High'], data['Low'], data['Close'])
engulfing = talib.CDLENGULFING(data['Open'], data['High'], data['Low'], data['Close'])

data['Morning Star'] = morning_stars
data['Engulfing'] = engulfing

# print(data)

engulfing_days = data[data['Engulfing'] != 0]

print(engulfing_days)