# Lấy danh sách giao dịch

**Method: GET**

#### HTTP Request

<https://api.accesstrade.vn/v1/transactions>

\*Limit : 10 requests/1 phút

**Query Parameters**

Các biến params được truyền vào HTTP Request theo các cặp Key-Value, mở đầu chuỗi params bằng dấu “?” và giữa các biến phân tách nhau bằng dấu “&”. Vd:

<https://api.accesstrade.vn/v1/transactions?since=2021-01-01T00:00:00Z&until=2021-01-03T00>

| **Biến params**     | **Required** | **Mô tả**                                                                                                                                                          |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| since               | Bắt buộc     | Thời gian bắt đầu report theo sale time (ISO format), ví dụ “2016-08-01T00:00:00Z”.                                                                                |
| until               | Bắt buộc     | Thời gian kết thúc report theo sale time (ISO format), ví dụ “2016-08-02T00:00:00Z”.                                                                               |
| page                | Tùy chọn     | Số trang, default None.                                                                                                                                            |
| offset              | Tùy chọn     | Offset value, default 0.                                                                                                                                           |
| limit               | Tùy chọn     | Số kết quả trả về mỗi lần, default 100.                                                                                                                            |
| merchant            | Tùy chọn     | Tên merchant. ex: tikivn.                                                                                                                                          |
| utm\_source         | Tùy chọn     | Ex: facebook                                                                                                                                                       |
| utm\_campaign       | Tùy chọn     |                                                                                                                                                                    |
| utm\_medium         | Tùy chọn     | Ex: email                                                                                                                                                          |
| utm\_content        | Tùy chọn     |                                                                                                                                                                    |
| status              | Tùy chọn     | <p>Trạng thái giao dịch:</p><ul><li>0 : hold</li><li>1 : approved</li><li> 2 : rejected</li></ul>                                                                  |
| is\_confirmed       | Tùy chọn     | <p>Trạng thái giao dịch: </p><ul><li>0 : chưa duyệt</li><li> 1 : đã duyệt (Nếu có tham số is\_confirmed mà không có status thì mặc định trường status=1)</li></ul> |
| transaction\_id     | Tùy chọn     | Mã giao dịch, có thể filter 1 (transaction\_id=1234567) hoặc nhiều (transaction\_id=1234567,7654321) bằng cách dùng dấu phẩy “,” để ngăn cách các mã.              |
| update\_time\_start | Tùy chọn     | Thời gian bắt đầu report theo thời gian update transaction (ISO forrmat), ví dụ “2016-08-01T00:00:00Z”.                                                            |
| update\_time\_end   | Tùy chọn     | Thời gian kết thúc report theo thời gian update transaction (ISO forrmat), ví dụ “2016-08-05T00:00:00Z”.                                                           |
| is\_brand\_bonus    | Tùy chọn     | <p>Filter theo 2 giá trị:</p><ul><li>true: Các mã giao dịch có ghi nhận brand bonus</li><li>false: Các mã giao dịch không ghi nhận brand bonus</li></ul>           |

**API reponse trả về:**

```
"data": [
        {
            "merchant": "shopee",
            "status": 1,
            "update_time": "2023-03-30T19:51:57",
            "click_url": "https://shopee.vn/universal-link/Móc-gắn-chìa-khóa-hình-chú-heo-xinh-xắn-i.565282464.12333534959?utm_campaign=&c=322&af_reengagement_window=7d&af_click_lookback=7d&utm_content=1-XZad9YPgG7WnFjkGT9nSUaphqmwHH5qVHsP0E3lHS8wiYbQo-accesstrade--&af_siteid=an_17104620000&pid=affiliates&utm_source=an_17104620000&is_retargeting=true&sp_atk=7b175c8d-430b-45d0-b1b9-d4d8964d82b3&xptdk=7b175c8d-430b-45d0-b1b9-d4d8964d82b3&af_sub_siteid=1&utm_medium=affiliates&af_viewthrough_lookback=1d&atnct1=5737c6ec2e0716f3d8a7a5c4e0de0d9a&atnct2=XZad9YPgG7WnFjkGT9nSUaphqmwHH5qVHsP0E3lHS8wiYbQo&atnct3=OexQA00063d000001",
            "conversion_platform": "website",
            "utm_campaign": "",
            "product_category": "brand_bonus",
            "utm_content": "",
            "transaction_time": "2023-01-04T09:02:45",
            "product_image": "",
            "utm_source": "",
            "is_brand_bonus": true,
            "transaction_value": 262.0,
            "_extra": {
                "parameters": {
                    "at_unique_id": "yNGwpAWm6PX~V~Ya2Yubeanxat",
                    "click_url": "https://shopee.vn/universal-link/Móc-gắn-chìa-khóa-hình-chú-heo-xinh-xắn-i.565282464.12333534959?utm_campaign=&c=322&af_reengagement_window=7d&af_click_lookback=7d&utm_content=1-XZad9YPgG7WnFjkGT9nSUaphqmwHH5qVHsP0E3lHS8wiYbQo-accesstrade--&af_siteid=an_17104620000&pid=affiliates&utm_source=an_17104620000&is_retargeting=true&sp_atk=7b175c8d-430b-45d0-b1b9-d4d8964d82b3&xptdk=7b175c8d-430b-45d0-b1b9-d4d8964d82b3&af_sub_siteid=1&utm_medium=affiliates&af_viewthrough_lookback=1d&atnct1=5737c6ec2e0716f3d8a7a5c4e0de0d9a&atnct2=XZad9YPgG7WnFjkGT9nSUaphqmwHH5qVHsP0E3lHS8wiYbQo&atnct3=OexQA00063d000001",
                    "click_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
                    "utm_tool": "deeplink"
                },
                "device_model": null,
                "device_family": "Other",
                "device_brand": null,
                "device_type": "pc",
                "device": "None Other",
                "os": "Windows",
                "browser": "Chrome"
            },
            "reason_rejected": "",
            "category_name": "",
            "utm_term": "",
            "product_id": "brand_bonus_12333534959@shopee@bonus",
            "is_confirmed": 1,
            "confirmed_time": "2023-02-28T23:59:59",
            "product_price": 262.0,
            "id": "95ea6bb766b28ecc419a9b3979ba29c2",
            "commission": 225.0,
            "customer_type": "",
            "conversion_id": 148916905,
            "utm_medium": "",
            "product_quantity": 1,
            "click_time": "2023-01-04T09:02:26",
            "product_name": "",
            "transaction_id": "230104EETP0VN8"
    
```

**Mô tả kết quả:**

| Tham số                   | Mô tả                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| total                     | Số lượng conversion, tính theo từng sản phẩm.                                                                                                                         |
| data.status               | <p>Trạng thái của conversion</p><ul><li>0: Pending or hold</li><li> 1: Approved</li><li> 2: Rejected.</li></ul>                                                       |
| data.merchant             | Tên merchant.                                                                                                                                                         |
| data.click\_time          | Thời gian phát sinh click, theo ISODate.                                                                                                                              |
| data.transaction\_id      | ID của giao dịch (Đơn hàng).                                                                                                                                          |
| data.transaction\_time    | Thời gian phát sinh giao dịch, theo ISODate.                                                                                                                          |
| data.update\_time         | Thời gian update thông tin giao dịch, theo ISODate.                                                                                                                   |
| data.confirmed\_time      | Thời gian duyệt giao dịch, theo ISODate.                                                                                                                              |
| data.is\_confirmed        | Trạng thái giao dịch: 0 - chưa duyệt, 1 - đã duyệt                                                                                                                    |
| data.transaction\_value   | Giá trị giao dịch.                                                                                                                                                    |
| data.commission           | Hoa hồng cho publisher.                                                                                                                                               |
| data.product\_id          | ID của sản phẩm.                                                                                                                                                      |
| data.product\_price       | Giá của sản phẩm.                                                                                                                                                     |
| data.product\_quantity    | Số lượng sản phẩm.                                                                                                                                                    |
| data.\_extra              | Các thông tin liên quan đến hệ điều hành và trình duyệt.                                                                                                              |
| data.\_utm\*              | Giá trị các tham số utm.                                                                                                                                              |
| data.category\_name       | Tên ngành hàng                                                                                                                                                        |
| data.conversion\_id       | Id của conversion                                                                                                                                                     |
| data.conversion\_platform | Các nền tảng của conversion                                                                                                                                           |
| data.customer\_type       | Loại khách hàng                                                                                                                                                       |
| data.product\_category    | Danh mục của sản phẩm                                                                                                                                                 |
| data.product\_image       | Hình ảnh của sản phẩm                                                                                                                                                 |
| data.product\_name        | Tên sản phẩm                                                                                                                                                          |
| data.reason\_reject       | Lý do hủy                                                                                                                                                             |
| is\_brand\_bonus          | <p>Thông tin brand bonus của sản phẩm:</p><ul><li>true: Các mã giao dịch có ghi nhận brand bonus</li><li>false: Các mã giao dịch không ghi nhận brand bonus</li></ul> |

*Example cURL: curl --location '<https://api-v1.dev.accesstrade.me/v1/transactions?until=2023-03-03T16%3A00%3A00Z\\&since=2023-01-03T15%3A00%3A00Z\\&limit=2>' \\*

*--header 'Authorization: Token bg1F-zURtCYDWH8KB79fLS5abjIyOg0G' \\*

*--header 'Content-Type: application/json'*
