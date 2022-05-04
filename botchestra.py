import vectorbtpro as vbt
import pandas as pd
import numpy as np 
import datetime, config
from binance.client import Client

client = Client(config.api_key, config.api_secret),

data = vbt.BinanceData.fetch('BTCUSDT')
data