import vectorbtpro as vbt
import pandas as pd
import numpy as np 
import datetime, config

#  client = Client(config.api_key, config.api_secret),

data = vbt.BinanceData.fetch('BTCUSDT')

def custom_indicator(close, window=14):
    rsi = vbt.RSI.run(close, window=window)
    return rsi.rsi

ind = vbt.IndicatorFactory(
    class_name='Combination',
    short_name='comb',
    input_names=['close'],
    param_names=['window'],
    output_names=['value']
    ).with_apply_func(
            custom_indicator,
            window=14)

res = ind.run(
        data,
        window=21)

print(res.value)