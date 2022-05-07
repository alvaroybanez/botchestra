import vectorbtpro as vbt 
import pandas as pd
import numpy as np
import config
from binance.client import Client
from vectorbtpro.utils.datetime_ import to_tzaware_datetime, get_local_tz

client = Client(config.api_key, config.api_secret)

def get_usdt_pairs(symbol, period='max', start=None, end=None, **kwargs):
    tickers = pd.DataFrame(client.get_all_tickers())
    usdt_symbols = tickers[tickers['symbol'].str.contains('USDT')]
    fetch_data = vbt.BinanceData.fetch(usdt_symbols)
    if start is not None:
        start = to_tzaware_datetime(start, tz=get_local_tz())
    if end is not None: 
        end = to_tzaware_datetime(end, tz=get_local_tz())
    return fetch_data(symbol).history(
        period=period,
        start=start,
        end=end,
        **kwargs)

get_usdt_pairs('BTCUSDT', start='2022-01-01', end='today')