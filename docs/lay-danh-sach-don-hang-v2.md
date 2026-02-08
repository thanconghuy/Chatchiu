# Lấy danh sách đơn hàng v2

**Method: GET**

#### HTTP Request <a href="#http-request" id="http-request"></a>

```
https://api.accesstrade.vn/v1/order-list
```

#### \*Lưu ý:   <a href="#query-parameters" id="query-parameters"></a>

* Limit : 10 requests/1 phút
* Cache 1 phút

#### Query Parameters <a href="#query-parameters" id="query-parameters"></a>

Các biến params được truyền vào HTTP Request theo các cặp Key-Value, mở đầu chuỗi params bằng dấu “?” và giữa các biến phân tách nhau bằng dấu “&”. Vd:&#x20;

```
https://api.accesstrade.vn/v1/order-list?since=2021-01-01T00:00:00Z&until=2021-01-10T00:00:00Z
```

| Biến params   | Required | Mô tả                                                                                                        |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| since         | bắt buộc | Thời gian bắt đầu report, theo ISO format, ví dụ “2016-08-01T00:00:00Z”.                                     |
| until         | bắt buộc | Thời gian kết thúc report, theo ISO format, ví dụ “2016-08-02T00:00:00Z”.                                    |
| page          | tùy chọn | Thứ tự page. Bắt đầu từ 1. Mặc định 1                                                                        |
| utm\_source   | tùy chọn | Ex: facebook                                                                                                 |
| utm\_campaign | tùy chọn |                                                                                                              |
| utm\_medium   | tùy chọn | Ex: email                                                                                                    |
| utm\_content  | tùy chọn |                                                                                                              |
| limit         | tùy chọn | Số lượng đơn hàng trả về mỗi page. Mặc định 30. Tối đa 300 (nếu điền quá 300 thì mặc định set 300)           |
| status        | tùy chọn | <p>Trạng thái của conversion</p><ul><li>0: Pending or hold</li><li>1: Approved</li><li>2:Rejected.</li></ul> |
| merchant      | tùy chọn | Vi dụ: adayroi, lazada.                                                                                      |

> API response trả về

```
{
"data": 
    [
       {
           "at_product_link": "https://shopee.vn/universal-link/product/214196144/17730719201?utm_campaign=&c=679&af_reengagement_window=7d&af_click_lookback=7d&smtt=0.549607455-1653894909.9&utm_content=XDbU5H4Qjy87NtFmlCNrsEo4jtBMzjvPRv3EON3JTvinCYXR-540355-679-IG-&af_siteid=an_17156540000&pid=affiliates&utm_source=an_17156540000&is_retargeting=true&referer=at-kol-new&af_sub_siteid=540355&utm_medium=affiliates&af_viewthrough_lookback=1d&atnct1=ca9c267dad0305d1a6308d2a0cf1c39c&atnct2=XDbU5H4Qjy87NtFmlCNrsEo4jtBMzjvPRv3EON3JTvinCYXR&atnct3=h50RJ00079r00bkxv",
           "billing": 69000.0,
           "browser": "Mobile Safari UI/WKWebView",
           "category_name": "Fashion_Accessories",
           "click_time": "2022-05-31T00:28:09",
           "client_platform": "mobile",
           "confirmed_time": "2022-07-01T23:59:31",
           "conversion_platform": null,
           "customer_type": null,
           "is_confirmed": 0,
           "landing_page": "https://www.instagram.com/",
           "merchant": "shopee_kolnew",
           "order_id": "220602QAVKQKCM",
           "order_pending": 0,
           "order_reject": 0,
           "order_approved": 1,
           "product_category": "Phu_Kien_Thoi_Trang",
           "products_count": 1,
           "pub_commission": 2208.0,
           "sales_time": "2022-06-01T23:59:31",
           "update_time": "2022-07-07T10:23:13",
           "utm_campaign": null,
           "utm_content": null,
           "utm_medium": null,
           "utm_source": "IG",
           "website": "https://www.instagram.com/",
           "website_url": "https://www.instagram.com/"
       }
   ],
   "total": 589
}
```

**Mô tả kết quả:**

| **Tham số**               | **Mô tả**                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| data.at\_product\_link    | Link cuối gắn các tham số tracking                                                                 |
| data.billing              | Giá trị đơn hàng                                                                                   |
| data.browser              | Nền tảng phát sinh đơn hàng                                                                        |
| data.category\_name       | Ngành hàng                                                                                         |
| data.click\_time          | Thời gian click                                                                                    |
| data.client\_platform     | Thiết bị                                                                                           |
| data.confirmed\_time      | Thời gian xác nhận giao dịch                                                                       |
| data.conversion\_platform |                                                                                                    |
| data.customer\_type       |                                                                                                    |
| data.is\_confirmed        | <p>Trạng thái duyệt đối soát giao dịch: </p><ul><li>0 - chưa duyệt</li><li>1 - đã duyệt </li></ul> |
| data.landing\_page        |                                                                                                    |
| data.merchant             | Tên merchant                                                                                       |
| data.order\_id            | ID đơn hàng                                                                                        |
| data.order\_pending       | Trạng thái đơn hàng (tổng số lượng item ở trạng thái pending)                                      |
| data.order\_reject        | Trạng thái đơn hàng (tổng số lượng item ở trạng thái reject)                                       |
| data.order\_approved      | Trạng thái đơn hàng (tổng số lượng item ở trạng thái approved)                                     |
| data.product\_category    | Ngành hàng của sản phẩm                                                                            |
| data.products\_count      | Số lượng sản phẩm                                                                                  |
| data.pub\_commission      | Hoa hồng cho publisher                                                                             |
| data.sales\_time          | Thời gian phát sinh                                                                                |
| data.update\_time         | Thời gian cập nhật                                                                                 |
| data.utm\_campaign        | utm\_campaign                                                                                      |
| data.utm\_content         | utm\_content                                                                                       |
| data.utm\_medium          | utm\_medium                                                                                        |
| data.utm\_source          | utm\_source                                                                                        |
| data.website              | Website nguồn                                                                                      |
| data.website\_url         | Đường dẫn đến website nguồn                                                                        |
