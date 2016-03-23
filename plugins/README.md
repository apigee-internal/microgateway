#User plugins
add your plugins here
must contain an init method
```javascript
{
  init:function(config,logger,stats){
    return {onrequest:function(){},...}
  }
}
```